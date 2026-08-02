-- supabase/migrations/20260817120000_vouchers_and_discounts.sql
--
-- Vouchers & discounts.
--
-- A merchant creates a code, scopes it to the whole menu / specific products /
-- specific categories, decides whether it may share an order with another code,
-- and caps how many times it can be claimed. The code is then honoured at web
-- checkout, at the register, and when an order is edited.
--
-- Three tables plus four columns on the order tables:
--   vouchers             — the definition
--   voucher_targets      — which products/categories a scoped voucher touches
--   voucher_redemptions  — append-only ledger; one row per voucher per order
--
-- Safety / reversibility: purely additive. Three new tables and four new
-- defaulted columns. No existing column changes type and no row data is
-- modified, so this is safe to apply online. Manual rollback at the bottom.
--
-- Where the money lives: `vouchers.used_count` is a cached counter maintained
-- by a trigger on the ledger — the ledger is the truth, the counter is the
-- index. Over-redemption is prevented by `redeem_voucher()` below, which does a
-- CONDITIONAL update rather than a read-then-write, so two cashiers claiming
-- the last redemption at the same moment cannot both win.
--
-- Access model: vouchers are merchant configuration and carry no PII, but the
-- redemption ledger records who redeemed what. Both follow the same RLS shape
-- as `customers` — the owning tenant's admins plus superadmin. Note the
-- policies compare `au.tenant_id` to the ROW's tenant_id (table-qualified);
-- the `au.tenant_id = au.tenant_id` self-comparison bug fixed in
-- 20260815130000 is exactly what that qualification prevents.

-- 1. Vouchers ---------------------------------------------------------------------
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  code text not null,
  name text not null,
  description text,

  -- 'percent' takes discount_value % off; 'fixed' takes that many pesos off;
  -- 'free_delivery' zeroes the delivery fee and ignores item scope entirely.
  discount_type text not null check (discount_type in ('percent', 'fixed', 'free_delivery')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  -- Ceiling for a percent voucher, so "50% off" cannot cost ₱5,000 on one order.
  max_discount_amount numeric(10,2) check (max_discount_amount is null or max_discount_amount > 0),
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),

  -- 'universal' touches everything; the other two read voucher_targets.
  scope text not null default 'universal' check (scope in ('universal', 'products', 'categories')),

  -- false = solo only: refuses to share an order with any other voucher.
  is_stackable boolean not null default false,

  -- null = unlimited.
  usage_limit_total integer check (usage_limit_total is null or usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  -- Cached count of voucher_redemptions rows; maintained by trigger below.
  used_count integer not null default 0,

  starts_at timestamptz,
  ends_at timestamptz,

  -- Where the code may be presented. Mirrors VoucherChannel in
  -- src/lib/vouchers/types.ts.
  channels text[] not null default array['checkout', 'pos', 'admin'],

  -- null = valid at every branch. Multi-branch tenants only.
  outlet_ids uuid[],

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  constraint vouchers_window_ordered check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- One code per tenant, case-insensitively: customers type "welcome10" and mean
-- WELCOME10, and a merchant must not be able to create both.
create unique index if not exists vouchers_tenant_code_uq
  on public.vouchers(tenant_id, lower(code));

create index if not exists vouchers_tenant_active_idx
  on public.vouchers(tenant_id, is_active);

comment on column public.vouchers.used_count is
  'Cached count of voucher_redemptions rows. The ledger is authoritative; this is maintained by trg_voucher_redemptions_count.';

-- 2. Targets ----------------------------------------------------------------------
-- Normalized rather than an array column so a deleted menu item or category
-- takes its targeting rows with it — a voucher pointing at a deleted product
-- would otherwise silently widen or break.
create table if not exists public.voucher_targets (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  target_type text not null check (target_type in ('menu_item', 'category')),
  target_id uuid not null,
  created_at timestamptz not null default now()
);

create unique index if not exists voucher_targets_uq
  on public.voucher_targets(voucher_id, target_type, target_id);

create index if not exists voucher_targets_voucher_idx
  on public.voucher_targets(voucher_id);

-- 3. Redemptions ------------------------------------------------------------------
-- Append-only. `order_id` is TEXT, not a uuid FK: orders live in Convex for
-- some tenants and in Postgres for others, and Convex ids are not uuids. Same
-- precedent as stock_movements (20260727120000_stock_movements_order_id_text).
create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  order_id text not null,

  -- Normalized phone/email used for the per-customer limit. Null for guests,
  -- where the limit is unenforceable by design.
  customer_key text,
  amount_discounted numeric(10,2) not null check (amount_discounted >= 0),
  channel text not null check (channel in ('checkout', 'pos', 'admin')),
  outlet_id uuid references public.outlets(id) on delete set null,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The idempotency key: a retried checkout must not claim the voucher twice.
create unique index if not exists voucher_redemptions_voucher_order_uq
  on public.voucher_redemptions(voucher_id, order_id);

create index if not exists voucher_redemptions_voucher_customer_idx
  on public.voucher_redemptions(voucher_id, customer_key);

create index if not exists voucher_redemptions_tenant_created_idx
  on public.voucher_redemptions(tenant_id, created_at desc);

-- 4. Counter maintenance ----------------------------------------------------------
create or replace function public.sync_voucher_used_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.vouchers
       set used_count = used_count + 1,
           updated_at = now()
     where id = new.voucher_id;
    return new;
  end if;

  -- A voided redemption gives the claim back.
  update public.vouchers
     set used_count = greatest(0, used_count - 1),
         updated_at = now()
   where id = old.voucher_id;
  return old;
end;
$$;

drop trigger if exists trg_voucher_redemptions_count on public.voucher_redemptions;
create trigger trg_voucher_redemptions_count
  after insert or delete on public.voucher_redemptions
  for each row execute function public.sync_voucher_used_count();

-- 5. Atomic redemption ------------------------------------------------------------
-- The only sanctioned way to claim a voucher. The usage check and the write
-- happen in ONE statement, so two cashiers racing for the last redemption
-- cannot both succeed — a read-then-write in application code would let them.
--
-- Returns the redemption id, or null when the voucher is exhausted. Re-running
-- it for the same (voucher, order) is a no-op that returns the existing id,
-- which is what makes a retried checkout safe.
create or replace function public.redeem_voucher(
  p_tenant_id uuid,
  p_voucher_id uuid,
  p_order_id text,
  p_amount numeric,
  p_channel text,
  p_customer_key text default null,
  p_outlet_id uuid default null,
  p_redeemed_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_claimed boolean;
  v_redemption_id uuid;
begin
  select id into v_existing
    from public.voucher_redemptions
   where voucher_id = p_voucher_id and order_id = p_order_id;

  if v_existing is not null then
    return v_existing;
  end if;

  -- Conditional claim: the WHERE clause is the concurrency control.
  update public.vouchers
     set updated_at = now()
   where id = p_voucher_id
     and tenant_id = p_tenant_id
     and is_active
     and (usage_limit_total is null or used_count < usage_limit_total)
     and (starts_at is null or starts_at <= now())
     and (ends_at is null or ends_at >= now())
  returning true into v_claimed;

  if v_claimed is not true then
    return null;
  end if;

  insert into public.voucher_redemptions (
    tenant_id, voucher_id, order_id, customer_key,
    amount_discounted, channel, outlet_id, redeemed_by
  ) values (
    p_tenant_id, p_voucher_id, p_order_id, p_customer_key,
    p_amount, p_channel, p_outlet_id, p_redeemed_by
  )
  returning id into v_redemption_id;

  return v_redemption_id;
end;
$$;

-- 6. Order-side columns -----------------------------------------------------------
-- For tenants whose orders live in Postgres. Convex tenants carry the same
-- payload inside `customerData.discount` (see src/lib/order-discount.ts), which
-- is what lets an already-deployed Convex backend accept a discounted order
-- with no schema bump and no per-tenant redeploy — the same trick POS payments
-- use.
alter table public.orders
  add column if not exists discount_total numeric(10,2) not null default 0,
  add column if not exists discount_data jsonb;

comment on column public.orders.discount_total is
  'Total discount applied. `total` is already NET of this; the column exists for reporting.';
comment on column public.orders.discount_data is
  'Applied vouchers and manual discounts: [{voucherId, code, label, amount}]. Mirrors customerData.discount on Convex tenants.';

alter table public.order_items
  add column if not exists discount_amount numeric(10,2) not null default 0;

comment on column public.order_items.discount_amount is
  'This line''s share of the order discount, from the engine''s per-line allocation. What makes a partial refund computable.';

-- 7. RLS --------------------------------------------------------------------------
alter table public.vouchers enable row level security;
alter table public.voucher_targets enable row level security;
alter table public.voucher_redemptions enable row level security;

drop policy if exists vouchers_tenant_access on public.vouchers;
create policy vouchers_tenant_access on public.vouchers
  for all
  using (
    exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and (au.role = 'superadmin' or au.tenant_id = vouchers.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and (au.role = 'superadmin' or au.tenant_id = vouchers.tenant_id)
    )
  );

drop policy if exists voucher_targets_tenant_access on public.voucher_targets;
create policy voucher_targets_tenant_access on public.voucher_targets
  for all
  using (
    exists (
      select 1
        from public.vouchers v
        join public.app_users au on au.user_id = auth.uid()
       where v.id = voucher_targets.voucher_id
         and (au.role = 'superadmin' or au.tenant_id = v.tenant_id)
    )
  )
  with check (
    exists (
      select 1
        from public.vouchers v
        join public.app_users au on au.user_id = auth.uid()
       where v.id = voucher_targets.voucher_id
         and (au.role = 'superadmin' or au.tenant_id = v.tenant_id)
    )
  );

drop policy if exists voucher_redemptions_tenant_access on public.voucher_redemptions;
create policy voucher_redemptions_tenant_access on public.voucher_redemptions
  for all
  using (
    exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and (au.role = 'superadmin' or au.tenant_id = voucher_redemptions.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and (au.role = 'superadmin' or au.tenant_id = voucher_redemptions.tenant_id)
    )
  );

-- Customers are anonymous at checkout, so voucher validation runs through the
-- service-role client on the server, never from the browser. No anon policy is
-- granted here on purpose: a public read would let anyone enumerate every
-- tenant's unreleased promo codes.

-- 8. Lock the RPCs down -----------------------------------------------------------
-- Both functions are SECURITY DEFINER, and PostgREST publishes every function in
-- `public` as an RPC endpoint. Left as created, /rest/v1/rpc/redeem_voucher would
-- let an anonymous caller claim redemptions against any voucher — the definer
-- rights bypass the very RLS that protects the ledger. Only the server redeems.
-- (Caught by the Supabase security advisor, `anon_security_definer_function_executable`.)
revoke all on function public.redeem_voucher(uuid, uuid, text, numeric, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_voucher(uuid, uuid, text, numeric, text, text, uuid, uuid)
  to service_role;

-- Trigger function: it fires with the table owner's rights regardless of grants,
-- so it has no business being reachable as an RPC at all.
revoke all on function public.sync_voucher_used_count() from public, anon, authenticated;

-- Manual rollback -----------------------------------------------------------------
-- drop function if exists public.redeem_voucher(uuid, uuid, text, numeric, text, text, uuid, uuid);
-- drop trigger if exists trg_voucher_redemptions_count on public.voucher_redemptions;
-- drop function if exists public.sync_voucher_used_count();
-- drop table if exists public.voucher_redemptions;
-- drop table if exists public.voucher_targets;
-- drop table if exists public.vouchers;
-- alter table public.orders drop column if exists discount_total, drop column if exists discount_data;
-- alter table public.order_items drop column if exists discount_amount;
