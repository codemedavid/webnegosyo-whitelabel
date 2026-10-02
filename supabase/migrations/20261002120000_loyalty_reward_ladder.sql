-- Reward ladder: several rewards on one card.
--
-- A program's rules gain `milestones: [{ at, reward }]` — rewards unlocked
-- part-way along the card (5 stamps → free drink) on the way to the top reward
-- at `threshold` (10 stamps → free meal), which is still the only rung that
-- spends stamps and starts a fresh card.
--
-- Which mid-card rewards a customer already holds is DERIVED, never counted:
-- every card a customer fills is a numbered `cycle` on their balance, and a
-- mid-card reward records the cycle and rung (`milestone_at`) it came from. A
-- rung is issued when an earn crosses it AND no live (non-voided) reward for
-- that rung exists on the current card, so:
--   * a reversal that voids an unused mid-card reward lets the next visit
--     earn it again (the customer is back below the rung);
--   * a reward already USED before its order was cancelled is never issued a
--     second time on the same card;
--   * a merchant voiding one by hand does not see it re-minted on the next
--     visit, because the next visit does not cross that rung.
-- Reversing the earn that completed a card (when its top reward is still
-- unused) returns the stamps AND rewinds the cycle, so the rewards already
-- held on that card stay counted.

alter table public.loyalty_balances
  add column if not exists cycle integer not null default 0;

comment on column public.loyalty_balances.cycle is
  'How many cards this customer has completed on the program. Mid-card rewards are unique per cycle and rung.';

alter table public.loyalty_entitlements
  add column if not exists milestone_at numeric check (milestone_at > 0),
  add column if not exists cycle integer;

comment on column public.loyalty_entitlements.milestone_at is
  'The mid-card rung that issued this reward; null for the top (card-completing) reward.';
comment on column public.loyalty_entitlements.cycle is
  'The card (loyalty_balances.cycle) this reward was issued on; null for rewards issued before the ladder.';

-- A mid-card reward spends nothing, so zero is a real historical threshold.
alter table public.loyalty_entitlements
  drop constraint if exists loyalty_entitlements_threshold_spent_check;
alter table public.loyalty_entitlements
  add constraint loyalty_entitlements_threshold_spent_check check (threshold_spent >= 0);

create index if not exists loyalty_entitlements_ladder_idx
  on public.loyalty_entitlements (program_id, customer_key, cycle, milestone_at)
  where milestone_at is not null;

drop function if exists public.apply_loyalty_earning(
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text, text
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
  p_request_id text default null,
  p_milestones jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_balance numeric;
  v_floor numeric;
  v_top numeric;
  v_cycle integer;
  v_issued integer := 0;
  v_rewound integer := 0;
  v_earn public.loyalty_ledger%rowtype;
  v_entitlement record;
  v_milestone record;
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

  if p_milestones is not null and jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'apply_loyalty_earning: p_milestones must be a json array';
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

  -- The upsert takes the row lock that serialises every earn for this card.
  insert into public.loyalty_balances (tenant_id, program_id, customer_key, customer_id, balance, lifetime_earned)
  values (p_tenant_id, p_program_id, p_customer_key, p_customer_id, p_delta, greatest(p_delta, 0))
  on conflict (program_id, customer_key) do update
    set balance = public.loyalty_balances.balance + excluded.balance,
        lifetime_earned = public.loyalty_balances.lifetime_earned + excluded.lifetime_earned,
        customer_id = coalesce(public.loyalty_balances.customer_id, excluded.customer_id),
        updated_at = now()
  returning balance, cycle into v_balance, v_cycle;

  if p_kind in ('earn', 'correction') and p_threshold is not null and p_threshold > 0 then
    -- Rungs crossed by THIS entry only: from where the card stood before it.
    v_floor := v_balance - p_delta;
    loop
      v_top := least(v_balance, p_threshold);
      if p_milestones is not null and v_top > v_floor then
        for v_milestone in
          select (m->>'at')::numeric as at, m->'terms' as terms
            from jsonb_array_elements(p_milestones) as m
           where (m->>'at')::numeric > v_floor
             and (m->>'at')::numeric <= v_top
             and (m->>'at')::numeric < p_threshold
           order by 1
        loop
          if not exists (
            select 1 from public.loyalty_entitlements
             where program_id = p_program_id and customer_key = p_customer_key
               and cycle = v_cycle and milestone_at = v_milestone.at
               and status <> 'voided'
          ) then
            insert into public.loyalty_entitlements (
              tenant_id, program_id, version_id, customer_key, source_ledger_id, terms,
              expires_at, threshold_spent, milestone_at, cycle
            ) values (
              p_tenant_id, p_program_id, p_version_id, p_customer_key, v_ledger_id,
              coalesce(v_milestone.terms, '{}'::jsonb), p_reward_expires_at, 0, v_milestone.at, v_cycle
            );
            v_issued := v_issued + 1;
          end if;
        end loop;
      end if;

      exit when v_balance < p_threshold;

      v_balance := v_balance - p_threshold;
      v_issued := v_issued + 1;
      insert into public.loyalty_entitlements (
        tenant_id, program_id, version_id, customer_key, source_ledger_id, terms,
        expires_at, threshold_spent, cycle
      ) values (
        p_tenant_id, p_program_id, p_version_id, p_customer_key, v_ledger_id,
        coalesce(p_reward_terms, '{}'::jsonb), p_reward_expires_at, p_threshold, v_cycle
      );
      v_cycle := v_cycle + 1;
      v_floor := 0;
    end loop;

    if v_issued > 0 then
      update public.loyalty_balances
         set balance = v_balance,
             cycle = v_cycle,
             rewards_issued = rewards_issued + v_issued,
             updated_at = now()
       where program_id = p_program_id and customer_key = p_customer_key;
    end if;
  end if;

  if p_kind = 'reverse' then
    for v_entitlement in
      select id, threshold_spent, milestone_at from public.loyalty_entitlements
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
      if v_entitlement.milestone_at is null and v_entitlement.threshold_spent > 0 then
        v_rewound := v_rewound + 1;
      end if;
    end loop;

    if v_refunded > 0 or v_rewound > 0 then
      update public.loyalty_balances
         set balance = balance + v_refunded,
             cycle = greatest(cycle - v_rewound, 0),
             updated_at = now()
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
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.apply_loyalty_earning(
  uuid, uuid, uuid, text, uuid, text, numeric, text, text, numeric, jsonb, timestamptz, boolean, uuid, text, text, jsonb
) to service_role;

-- A refunded receipt whose ORIGINATING purchase was also reversed hands back the
-- stamps a top reward spent. That rewinds a completed card exactly as the
-- reverse path above does, so the card number must rewind with it; otherwise
-- the next card's mid-card rewards are numbered against the wrong card and one
-- is skipped. Mid-card rewards spend nothing and leave the card number alone.
-- Identical to 20260914171000 apart from the `cycle` line.
create or replace function public.restore_loyalty_refunded_receipt(p_tenant_id uuid,p_settlement_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare reward loyalty_entitlements%rowtype; source loyalty_ledger%rowtype; next_status text;
begin
 select e.* into reward from loyalty_entitlements e join loyalty_reservations h on h.entitlement_id=e.id
  join loyalty_pos_settlements s on s.reservation_id=h.id where s.id=p_settlement_id and s.tenant_id=p_tenant_id;
 if not found then return false; end if;
 perform 1 from loyalty_balances where program_id=reward.program_id and customer_key=reward.customer_key for update;
 select * into reward from loyalty_entitlements where id=reward.id for update;
 if exists(select 1 from loyalty_refund_restorations where settlement_id=p_settlement_id) then return false; end if;
 if reward.status<>'consumed' or reward.consumed_order_backend<>'platform_supabase' or reward.consumed_order_id<>p_settlement_id::text then return false; end if;
 next_status:=case when reward.expires_at<=clock_timestamp() then 'expired' else 'restored' end;
 select * into source from loyalty_ledger where id=reward.source_ledger_id;
 if found and exists(select 1 from loyalty_ledger l where l.program_id=source.program_id and l.order_backend=source.order_backend
  and l.external_order_id=source.external_order_id and l.kind='reverse') then
  -- The originating purchase was also reversed while this reward was spent.
  -- Void the returned reward and return its retained threshold cost once.
  next_status:='voided';
  update loyalty_balances set balance=balance+coalesce(reward.threshold_spent,0),
         cycle=case when reward.milestone_at is null and coalesce(reward.threshold_spent,0)>0
                    then greatest(cycle-1,0) else cycle end
   where program_id=reward.program_id and customer_key=reward.customer_key;
 end if;
 update loyalty_entitlements set status=next_status where id=reward.id;
 insert into loyalty_refund_restorations(settlement_id,entitlement_id,disposition) values(p_settlement_id,reward.id,next_status);
 insert into loyalty_ledger(tenant_id,program_id,version_id,customer_key,kind,delta,order_backend,external_order_id,note)
  values(p_tenant_id,reward.program_id,reward.version_id,reward.customer_key,'correction',case when next_status='voided' then coalesce(reward.threshold_spent,0) else 0 end,'platform_supabase',p_settlement_id::text,'Reward returned after verified full refund: '||next_status);
 return true;
end $$;

revoke all on function public.restore_loyalty_refunded_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.restore_loyalty_refunded_receipt(uuid,uuid) to service_role;
