-- Preserve the cost of each issued reward independently of future versions.
-- Existing rewards recover their cost from their immutable program version.
alter table public.loyalty_entitlements
  add column if not exists threshold_spent numeric check (threshold_spent > 0);

update public.loyalty_entitlements e
   set threshold_spent = (v.rules->>'threshold')::numeric
  from public.loyalty_program_versions v
 where e.version_id = v.id and e.threshold_spent is null
   and jsonb_typeof(v.rules->'threshold') = 'number'
   and (v.rules->>'threshold')::numeric > 0;

comment on column public.loyalty_entitlements.threshold_spent is
  'Balance spent to issue this reward. Returned only when reversal voids an unclaimed reward.';

create or replace function public.apply_loyalty_earning(
  p_tenant_id uuid,
  p_program_id uuid,
  p_version_id uuid,
  p_customer_key text,
  p_customer_id uuid,
  p_kind text,
  p_delta numeric,
  p_order_backend text,
  p_external_order_id text,
  p_threshold numeric,
  p_reward_terms jsonb,
  p_reward_expires_at timestamptz,
  p_shadow boolean,
  p_actor uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_balance numeric;
  v_issued integer := 0;
  v_earn public.loyalty_ledger%rowtype;
  v_entitlement record;
  v_refunded numeric := 0;
begin
  if p_customer_key is null or length(trim(p_customer_key)) = 0 then
    raise exception 'apply_loyalty_earning: customer_key is required';
  end if;

  -- The program must belong to the tenant named, or a caller could move a
  -- balance in another store's program by guessing its id.
  if not exists (
    select 1 from public.loyalty_programs
     where id = p_program_id and tenant_id = p_tenant_id
  ) then
    raise exception 'apply_loyalty_earning: program % does not belong to tenant %', p_program_id, p_tenant_id;
  end if;

  -- A reversal is determined by immutable history, never current identity,
  -- version, program status, or the tenant's current shadow setting.
  if p_kind = 'reverse' then
    select * into v_earn from public.loyalty_ledger
     where tenant_id = p_tenant_id and program_id = p_program_id
       and order_backend = p_order_backend and external_order_id = p_external_order_id
       and kind = 'earn';
    if not found then
      return jsonb_build_object('applied', false, 'reason', 'nothing_to_reverse');
    end if;
    p_customer_key := v_earn.customer_key;
    p_customer_id := null;
    p_version_id := v_earn.version_id;
    p_delta := -v_earn.delta;
    p_shadow := v_earn.is_shadow;
  end if;

  insert into public.loyalty_ledger (
    tenant_id, program_id, version_id, customer_key, kind, delta,
    order_backend, external_order_id, is_shadow, actor, note
  ) values (
    p_tenant_id, p_program_id, p_version_id, p_customer_key, p_kind, p_delta,
    p_order_backend, p_external_order_id, coalesce(p_shadow, false), p_actor, p_note
  )
  on conflict (program_id, order_backend, external_order_id, kind)
    where external_order_id is not null
  do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end if;

  if coalesce(p_shadow, false) then
    return jsonb_build_object('applied', true, 'shadow', true, 'ledgerId', v_ledger_id);
  end if;

  insert into public.loyalty_balances (tenant_id, program_id, customer_key, customer_id, balance, lifetime_earned)
  values (p_tenant_id, p_program_id, p_customer_key, p_customer_id, p_delta, greatest(p_delta, 0))
  on conflict (program_id, customer_key) do update
    set balance = public.loyalty_balances.balance + excluded.balance,
        lifetime_earned = public.loyalty_balances.lifetime_earned + excluded.lifetime_earned,
        customer_id = coalesce(public.loyalty_balances.customer_id, excluded.customer_id),
        updated_at = now()
  returning balance into v_balance;

  if p_kind = 'earn' and p_threshold is not null and p_threshold > 0 then
    while v_balance >= p_threshold loop
      v_balance := v_balance - p_threshold;
      v_issued := v_issued + 1;
      insert into public.loyalty_entitlements (
        tenant_id, program_id, version_id, customer_key, source_ledger_id, terms, expires_at, threshold_spent
      ) values (
        p_tenant_id, p_program_id, p_version_id, p_customer_key, v_ledger_id,
        coalesce(p_reward_terms, '{}'::jsonb), p_reward_expires_at, p_threshold
      );
    end loop;

    if v_issued > 0 then
      update public.loyalty_balances
         set balance = v_balance,
             rewards_issued = rewards_issued + v_issued,
             updated_at = now()
       where program_id = p_program_id and customer_key = p_customer_key;
    end if;
  end if;

  if p_kind = 'reverse' then
    -- The balance upsert already serializes changes for this customer. Lock
    -- rewards as well so a concurrent claim cannot consume one we are voiding.
    for v_entitlement in
      select id, threshold_spent from public.loyalty_entitlements
       where tenant_id = p_tenant_id and source_ledger_id = v_earn.id
         and status in ('issued', 'reserved', 'restored')
       order by id for update
    loop
      if v_entitlement.threshold_spent is null then
        raise exception 'apply_loyalty_earning: reward % has no historical threshold; repair its snapshot before reversing', v_entitlement.id;
      end if;
      update public.loyalty_entitlements set status = 'voided', updated_at = now()
       where id = v_entitlement.id;
      update public.loyalty_reservations set status = 'released', updated_at = now()
       where tenant_id = p_tenant_id and entitlement_id = v_entitlement.id and status = 'held';
      v_refunded := v_refunded + v_entitlement.threshold_spent;
    end loop;

    -- Issuance already spent this threshold. Voiding the reward returns that
    -- spend; the negative earn delta above removes only the refunded order.
    -- Consumed/expired rewards retain their cost and may leave a debt.
    if v_refunded > 0 then
      update public.loyalty_balances
         set balance = balance + v_refunded, updated_at = now()
       where program_id = p_program_id and customer_key = p_customer_key
       returning balance into v_balance;
    end if;
  end if;

  return jsonb_build_object(
    'applied', true,
    'shadow', false,
    'ledgerId', v_ledger_id,
    'balance', v_balance,
    'entitlementsIssued', v_issued
  );
end;
$$;
