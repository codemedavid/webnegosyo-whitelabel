-- Loyalty member management: make a hand-made balance change safe, and give a
-- merchant a way to settle a reward that was honoured (or issued) off-system.
--
-- Two defects sat behind the management UI and are fixed here:
--
--  1. A correction was NOT idempotent. The duplicate-earn defence is a partial
--     unique index over the ORDER reference, and a correction has no order, so
--     the same correction submitted twice wrote two ledger rows and doubled the
--     balance. Corrections now carry a caller-minted `request_id` that is
--     unique per program, and a replay returns `duplicate` without writing.
--
--  2. A correction never issued a reward: the threshold loop was gated on
--     `p_kind = 'earn'`. Topping a customer past the threshold by hand left
--     them stuck above it with nothing to claim, and the next real visit then
--     minted several rewards at once. The gate now admits corrections.

alter table public.loyalty_ledger
  add column if not exists request_id text;

comment on column public.loyalty_ledger.request_id is
  'Caller-minted idempotency key for order-less entries (corrections). Unique per program.';

-- The idempotency defence for entries that have no order reference. Partial,
-- exactly like the order-based one, so ordinary earning is untouched.
create unique index if not exists loyalty_ledger_request_unique
  on public.loyalty_ledger (tenant_id, program_id, request_id)
  where request_id is not null;

-- Who settled a reward by hand, and why. The ledger explains balance moves;
-- these explain an entitlement that changed status without one.
alter table public.loyalty_entitlements
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.loyalty_entitlements
  add column if not exists resolution_note text;

comment on column public.loyalty_entitlements.resolution_note is
  'Why a merchant marked this reward used or voided by hand. Null for automatic transitions.';

-- The signature gains `p_request_id`, so the old one is dropped rather than
-- overloaded: PostgREST calls by name and two overloads would be ambiguous.
drop function if exists public.apply_loyalty_earning(
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text
);

create function public.apply_loyalty_earning(
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
  p_note text default null,
  p_request_id text default null
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

  if not exists (
    select 1 from public.loyalty_programs
     where id = p_program_id and tenant_id = p_tenant_id
  ) then
    raise exception 'apply_loyalty_earning: program % does not belong to tenant %', p_program_id, p_tenant_id;
  end if;

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

  -- Two independent duplicate defences, one per kind of entry: the ORDER
  -- reference for earning, the REQUEST id for an order-less correction. A
  -- statement can only name one `on conflict` target, so the second arrives as
  -- a unique violation and is translated to the same honest answer.
  begin
    insert into public.loyalty_ledger (
      tenant_id, program_id, version_id, customer_key, kind, delta,
      order_backend, external_order_id, is_shadow, actor, note, request_id
    ) values (
      p_tenant_id, p_program_id, p_version_id, p_customer_key, p_kind, p_delta,
      p_order_backend, p_external_order_id, coalesce(p_shadow, false), p_actor, p_note,
      nullif(trim(coalesce(p_request_id, '')), '')
    )
    on conflict (program_id, order_backend, external_order_id, kind)
      where external_order_id is not null
    do nothing
    returning id into v_ledger_id;
  exception when unique_violation then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end;

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

  -- A correction crosses the threshold exactly as a visit does. Anything else
  -- leaves a hand-topped customer parked above the line with nothing to claim,
  -- and mints the backlog on their next real visit instead.
  if p_kind in ('earn', 'correction') and p_threshold is not null and p_threshold > 0 then
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

revoke all on function public.apply_loyalty_earning(
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.apply_loyalty_earning(
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text, text
) to service_role;

-- Settle one reward by hand.
--
-- Two merchant intents, both real at a counter: the customer USED the reward
-- and the register never saw it, or the reward should never have existed.
-- Neither returns stamps — the balance was already spent to mint it, and
-- handing the stamps back would silently re-arm the next earn. A merchant who
-- wants the stamps back makes a correction, which says so in the ledger.
--
-- A reward a POS quote is holding (`reserved`) is refused: the register is
-- mid-sale with it, and two paths settling the same reward is a double spend.
create or replace function public.resolve_loyalty_entitlement(
  p_tenant_id uuid,
  p_entitlement_id uuid,
  p_action text,
  p_actor uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.loyalty_entitlements%rowtype;
  v_status text;
begin
  if p_action not in ('consume', 'void') then
    raise exception 'resolve_loyalty_entitlement: action must be consume or void';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'resolve_loyalty_entitlement: a note is required';
  end if;

  select * into v_row from public.loyalty_entitlements
   where id = p_entitlement_id and tenant_id = p_tenant_id
   for update;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'not_found');
  end if;

  if v_row.status = 'reserved' then
    return jsonb_build_object('applied', false, 'reason', 'reserved');
  end if;

  if v_row.status not in ('issued', 'restored') then
    -- Already settled. Idempotent for the action that put it there, so a
    -- double tap reads as success rather than a scary failure.
    return jsonb_build_object(
      'applied', false,
      'reason', case
        when v_row.status = 'consumed' and p_action = 'consume' then 'already_consumed'
        when v_row.status = 'voided' and p_action = 'void' then 'already_voided'
        else 'not_settleable'
      end,
      'status', v_row.status
    );
  end if;

  v_status := case when p_action = 'consume' then 'consumed' else 'voided' end;

  update public.loyalty_entitlements
     set status = v_status,
         consumed_at = case when p_action = 'consume' then now() else consumed_at end,
         resolved_by = p_actor,
         resolution_note = trim(p_note),
         updated_at = now()
   where id = p_entitlement_id;

  return jsonb_build_object('applied', true, 'status', v_status);
end;
$$;

revoke all on function public.resolve_loyalty_entitlement(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.resolve_loyalty_entitlement(uuid, uuid, text, uuid, text)
  to service_role;
