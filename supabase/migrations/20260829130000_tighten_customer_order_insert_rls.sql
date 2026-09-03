-- Close the two CRITICAL RLS gaps found in the 2026-08-29 platform-DB audit.
-- APPLIED to the live project on 2026-08-29 (as `tighten_customer_order_insert_rls`
-- + `order_items_anon_insert_visibility_fix`); this file mirrors it for the repo.
--
-- 1) orders_insert was WITH CHECK (true): anyone holding the shipped anon key
--    could inject orders into ANY tenant with any status/total — fake orders
--    landing straight in a merchant's live queue, KDS and stats. Anonymous
--    checkout (customer mobile app inserts directly; web checkout uses the
--    service role and is unaffected) only ever writes status='pending' /
--    payment_status='pending' into an active tenant, so that is all the anon
--    role may do now. Authenticated staff writes already flow through
--    orders_write_admin (app_user_may_see_order) and are untouched.
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_insert_customer on public.orders;
create policy orders_insert_customer on public.orders
  for insert to anon
  with check (
    status = 'pending'
    and payment_status = 'pending'
    and exists (
      select 1 from public.tenants t
      where t.id = tenant_id and t.is_active = true
    )
  );

-- 2) order_items_insert only checked that the parent order EXISTS, so leaked
--    order ids allowed appending arbitrary line items to any tenant's order.
--    Anonymous checkout writes its items immediately after creating its own
--    pending order, so the anon window is: parent still pending AND created in
--    the last 15 minutes. The predicate is SECURITY DEFINER because the anon
--    role cannot SELECT orders at all — evaluated as the caller, the policy
--    subquery would refuse even the legitimate flow. It returns one boolean
--    and leaks nothing else about the row. Staff edits still flow through
--    order_items_write_admin.
create or replace function public.order_accepts_anon_items(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.status = 'pending'
      and o.created_at > (now() - interval '15 minutes')
  );
$$;

revoke all on function public.order_accepts_anon_items(uuid) from public;
grant execute on function public.order_accepts_anon_items(uuid) to anon;

drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_insert_customer on public.order_items;
create policy order_items_insert_customer on public.order_items
  for insert to anon
  with check (public.order_accepts_anon_items(order_id));

-- 3) Advisor ERROR: the Loyverse dedupe backup table was publicly readable.
alter table if exists public.menu_items_loyverse_dupe_backup_20260821
  enable row level security;
