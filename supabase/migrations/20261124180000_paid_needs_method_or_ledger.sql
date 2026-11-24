-- A register sale may only be marked PAID by a staff session when the money
-- is recorded under a method: the order names its method, or its ledger
-- (order_payments) already holds the bill.
--
-- Koko Coffee, 2026-11-24: handing over a "pay later" sale wrote
-- payment_status = 'paid' with no method and no ledger row, so Sales filed the
-- money under "Paid, method not picked" and cash + GCash never added up to
-- sales (72 POS orders, ~P26,000, 8 stores in 30 days). The app no longer does
-- this (webnegosyo-app/lib/paid-writes.test.ts); this is the backstop for
-- builds still in the field. An old build swallows the refusal, so the order
-- keeps reading "still to collect" (true) instead of "method not picked".
--
-- Scope, on purpose:
--  * UPDATE only. A split sale at the register (lib/pos-split-tender.ts) is
--    INSERTED paid with no method and its ledger rows land after it; inserts
--    are never checked here.
--  * POS orders only (source = 'pos'). Web orders carry the customer's method.
--  * `authenticated` only. Service role and definer RPCs are untouched.
--  * Only the transition INTO paid; re-saving an already paid order is free.
--
-- The ledger sum runs in a SECURITY DEFINER helper: a cashier who may mark an
-- order paid need not hold a payment READ key, and an RLS-hidden ledger would
-- otherwise read as empty and refuse a bill that is in fact settled.

create or replace function public.order_ledger_net_charged(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0)
  from public.order_payments
  where order_id = p_order_id
$$;

revoke all on function public.order_ledger_net_charged(uuid) from public, anon;
grant execute on function public.order_ledger_net_charged(uuid) to authenticated, service_role;

create or replace function public.orders_paid_needs_method_or_ledger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.payment_method_id is not null or coalesce(btrim(new.payment_method_name), '') <> '' then
    return new;
  end if;
  if public.order_ledger_net_charged(new.id) >= coalesce(new.total, 0) then
    return new;
  end if;
  raise exception 'Record how this order was paid before marking it paid.'
    using errcode = '42501';
end;
$$;

drop trigger if exists orders_paid_needs_method_or_ledger on public.orders;
create trigger orders_paid_needs_method_or_ledger
  before update of payment_status on public.orders
  for each row
  when (
    new.payment_status = 'paid'
    and old.payment_status is distinct from 'paid'
    and new.source = 'pos'
  )
  execute function public.orders_paid_needs_method_or_ledger();
