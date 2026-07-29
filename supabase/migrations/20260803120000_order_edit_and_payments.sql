-- Editing a placed order, and the money that follows from it.
--
-- Until now an order was write-once: `order_items` was inserted at checkout and
-- never touched again (the only DELETEs anywhere are the tenant-delete cascade
-- and a failed-insert rollback). Staff who needed to correct a bill had no
-- option but to cancel and re-ring, which loses the original order entirely.
--
-- Two new tables make editing safe:
--
--   order_payments   an append-only ledger of every settlement against an
--                    order: the original tender, an additional charge taken
--                    after an edit raised the total, a refund after an edit
--                    lowered it. Nothing is ever updated in place, so the
--                    ledger stays a truthful account of money in and out.
--
--   order_revisions  an immutable before/after snapshot per edit. This is what
--                    makes an edited bill defensible weeks later: who changed
--                    what, when, and what it did to the total.
--
-- `orders.amount_paid` is a denormalized cache maintained by trigger from the
-- ledger — the order list and the shift drawer read it on every render and must
-- not aggregate a child table to do so. This mirrors the trigger-maintained
-- stock ledger already in use for inventory.
--
-- Balance is deliberately NOT stored: it is always `total - amount_paid`, and
-- two writable representations of the same number drift.

-- ---------------------------------------------------------------------------
-- 1. orders — settlement cache and edit provenance
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists amount_paid numeric(10, 2) not null default 0,
  add column if not exists revision_number integer not null default 0,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid;

comment on column public.orders.amount_paid is
  'Net collected (charges minus refunds). Maintained by trigger from order_payments; never write directly.';
comment on column public.orders.revision_number is
  'Bumped on every edit. Doubles as the optimistic-concurrency token so two staff cannot silently overwrite each other.';

-- ---------------------------------------------------------------------------
-- 2. order_payments — the append-only settlement ledger
-- ---------------------------------------------------------------------------
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,

  -- 'charge' takes money in, 'refund' gives it back. Amount is always
  -- positive; the kind carries the sign. Storing signed amounts invites a
  -- refund row that accidentally reads as a charge.
  kind text not null,
  amount numeric(10, 2) not null,

  -- How it was settled. The method is denormalized by NAME as well as id
  -- because a merchant may later delete or rename the payment method, and a
  -- historical receipt must still say how it was actually paid.
  payment_method_id uuid,
  payment_method_name text,
  reference text,
  proof_url text,
  proof_public_id text,

  -- Who and where. Both nullable: pre-staff-management admins have no
  -- app_users row, and single-location stores have no outlet.
  recorded_by uuid,
  outlet_id uuid references public.outlets (id) on delete set null,
  note text,

  created_at timestamptz not null default now(),

  constraint order_payments_kind_ck check (kind in ('charge', 'refund')),
  constraint order_payments_amount_ck check (amount > 0)
);

create index if not exists order_payments_order_idx
  on public.order_payments (order_id, created_at);
create index if not exists order_payments_tenant_created_idx
  on public.order_payments (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. order_revisions — the audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.order_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,

  revision_number integer not null,

  -- Full item snapshots rather than a patch. An order's items are small, and a
  -- snapshot stays readable even after the menu item it referenced is deleted.
  items_before jsonb not null,
  items_after jsonb not null,
  total_before numeric(10, 2) not null,
  total_after numeric(10, 2) not null,

  reason text,
  revised_by uuid,
  outlet_id uuid references public.outlets (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Doubles as the optimistic lock: two concurrent edits computing the same
  -- next revision number means the second INSERT fails instead of clobbering.
  constraint order_revisions_number_uq unique (order_id, revision_number)
);

create index if not exists order_revisions_order_idx
  on public.order_revisions (order_id, revision_number desc);

-- ---------------------------------------------------------------------------
-- 4. Keep orders.amount_paid in step with the ledger
-- ---------------------------------------------------------------------------
create or replace function public.sync_order_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders
  set amount_paid = coalesce((
        select sum(case when kind = 'refund' then -amount else amount end)
        from public.order_payments
        where order_id = target_order
      ), 0)
  where id = target_order;

  return null;
end;
$$;

-- AFTER, statement-agnostic, and covering DELETE too: the ledger is
-- append-only by policy, but a tenant-delete cascade still fires DELETEs and
-- the cache must not be left stale if that ever runs against a live order.
drop trigger if exists order_payments_sync_amount_paid on public.order_payments;
create trigger order_payments_sync_amount_paid
  after insert or update or delete on public.order_payments
  for each row execute function public.sync_order_amount_paid();

-- ---------------------------------------------------------------------------
-- 5. Backfill: every already-paid order gets its opening ledger row
-- ---------------------------------------------------------------------------
-- Without this, every historic paid order would show its full total as still
-- owing the moment someone opened it for editing.
insert into public.order_payments (
  tenant_id, order_id, kind, amount, payment_method_id, payment_method_name,
  reference, proof_url, proof_public_id, created_at
)
select
  o.tenant_id,
  o.id,
  'charge',
  o.total,
  o.payment_method_id,
  o.payment_method_name,
  o.payment_proof_reference,
  o.payment_proof_url,
  o.payment_proof_public_id,
  coalesce(o.created_at, now())
from public.orders o
where o.payment_status in ('paid', 'verified')
  and o.total > 0
  and not exists (
    select 1 from public.order_payments p where p.order_id = o.id
  );

-- ---------------------------------------------------------------------------
-- 6. RLS — mirrors the orders policies these rows hang off
-- ---------------------------------------------------------------------------
alter table public.order_payments enable row level security;
alter table public.order_revisions enable row level security;

-- Reads are scoped through the parent order, so a row is visible exactly when
-- the order it settles is. Writes are admin-only: a customer must never be
-- able to record their own payment.
drop policy if exists order_payments_select on public.order_payments;
create policy order_payments_select on public.order_payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_payments.order_id
        and o.tenant_id = order_payments.tenant_id
    )
  );

drop policy if exists order_payments_write_admin on public.order_payments;
create policy order_payments_write_admin on public.order_payments
  for insert with check (
    exists (
      select 1 from public.app_users u
      where u.id = auth.uid()
        and (u.role = 'superadmin' or u.tenant_id = order_payments.tenant_id)
    )
  );

drop policy if exists order_revisions_select on public.order_revisions;
create policy order_revisions_select on public.order_revisions
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_revisions.order_id
        and o.tenant_id = order_revisions.tenant_id
    )
  );

drop policy if exists order_revisions_write_admin on public.order_revisions;
create policy order_revisions_write_admin on public.order_revisions
  for insert with check (
    exists (
      select 1 from public.app_users u
      where u.id = auth.uid()
        and (u.role = 'superadmin' or u.tenant_id = order_revisions.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Realtime
-- ---------------------------------------------------------------------------
-- The merchant app's order detail subscribes to payment rows so a second
-- device settling the balance updates the first without a manual refresh.
alter table public.order_payments replica identity full;
alter table public.order_revisions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'order_payments'
    ) then
      alter publication supabase_realtime add table public.order_payments;
    end if;
  end if;
end $$;
