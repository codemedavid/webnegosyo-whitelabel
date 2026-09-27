-- Customer delivery quotes are verified by createOrderAction with a server
-- signature. An anonymous direct insert has no such proof. Keep existing
-- customer policies, but restrict their Lalamove writes to an authoritative
-- non-delivery order type owned by the same tenant. A missing type, forged
-- quotation ID, or another tenant's pickup type cannot bypass the guard.
-- Authenticated merchant/POS and service-role checkout retain their policies.
drop policy if exists orders_require_server_lalamove_quote on public.orders;
create policy orders_require_server_lalamove_quote on public.orders
  as restrictive for insert to anon
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = orders.tenant_id
        and (
          not coalesce(t.lalamove_enabled, false)
          or (
            orders.lalamove_quotation_id is null
            and exists (
              select 1 from public.order_types ot
              where ot.id = orders.order_type_id
                and ot.tenant_id = orders.tenant_id
                and ot.type <> 'delivery'
            )
          )
        )
    )
  );
