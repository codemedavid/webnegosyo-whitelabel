-- Register: attach a guest to a sale without reading the guest list.
--
-- Split out of 20261004180000_customers_staff_permission.sql (originally
-- shipped as 20261004120000_customers_staff_permission.sql, a version that
-- collided with 20261004120000_loyalty_sms_gateway.sql and was never applied).
-- The merchant app's POS picker and Wallet-card scan (attach-lookup.ts) call
-- these two RPCs; without them PostgREST answered 404 and a scanned card showed
-- "Card recognised, but the guest could not be attached."
--
-- This file is ADDITIVE ONLY: it changes no policy. The RLS tightening that
-- makes these functions the register's only way in lives in the later file and
-- waits until every store runs an app build that uses this RPC path.
--
-- Both are security definer and open to staff holding `pos` OR `customers`
-- (public.loyalty_has_permission: superadmin, owner, legacy NULL-permissions
-- admin, or a staff member holding the key — always scoped to p_tenant_id).

-- The guest with EXACTLY this number (or, with no number, this email). No
-- partial match and one row at most: a cashier can recognise a guest who tells
-- them their number, never page through the book.
create or replace function public.pos_find_customer(
  p_tenant_id uuid,
  p_phone_e164 text default null,
  p_email text default null
)
returns table (id uuid, name text, phone_e164 text, email text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_phone text := nullif(btrim(p_phone_e164), '');
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if not (public.loyalty_has_permission(p_tenant_id, 'pos')
          or public.loyalty_has_permission(p_tenant_id, 'customers')) then
    raise exception 'not allowed to look up customers for this store' using errcode = '42501';
  end if;

  if v_phone is not null then
    -- customers_tenant_phone_uq: at most one row.
    return query
      select c.id, c.name, c.phone_e164, c.email
      from public.customers c
      where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
      limit 1;
    return;
  end if;

  if v_email is not null then
    -- An email is unique only among phone-less guests, so prefer that record,
    -- then the most recently active one: deterministic, never arbitrary.
    return query
      select c.id, c.name, c.phone_e164, c.email
      from public.customers c
      where c.tenant_id = p_tenant_id and lower(c.email) = v_email
      order by (c.phone_e164 is null) desc, c.last_order_at desc nulls last, c.created_at desc
      limit 1;
  end if;
end
$$;
revoke all on function public.pos_find_customer(uuid, text, text) from public, anon;
grant execute on function public.pos_find_customer(uuid, text, text) to authenticated;

-- Save a guest met at the counter. A number (or, for a phone-less guest, an
-- email) already on file raises 23505, which the app reports as "already
-- saved".
create or replace function public.pos_create_customer(
  p_tenant_id uuid,
  p_name text default null,
  p_phone_e164 text default null,
  p_email text default null
)
returns table (id uuid, name text, phone_e164 text, email text)
language plpgsql volatile security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_name text := left(nullif(btrim(p_name), ''), 120);
  v_phone text := nullif(btrim(p_phone_e164), '');
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if not (public.loyalty_has_permission(p_tenant_id, 'pos')
          or public.loyalty_has_permission(p_tenant_id, 'customers')) then
    raise exception 'not allowed to save customers for this store' using errcode = '42501';
  end if;

  if v_phone is null and v_email is null then
    raise exception 'a phone number or email is required' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone must be E.164' using errcode = '22023';
  end if;
  -- Reject rather than truncate: a silently shortened address is a wrong one.
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'email is not valid' using errcode = '22023';
  end if;

  -- customers_tenant_email_uq compares email case-sensitively; the lookup above
  -- is case-insensitive, so enforce the same identity here.
  if v_phone is null and exists (
    select 1 from public.customers c
    where c.tenant_id = p_tenant_id and c.phone_e164 is null and lower(c.email) = v_email
  ) then
    raise exception 'a guest with this email is already saved' using errcode = '23505';
  end if;

  -- INTO the OUT columns + RETURN NEXT rather than RETURN QUERY INSERT, which
  -- older plpgsql refuses to run as a cursor.
  insert into public.customers as c (tenant_id, name, phone_e164, email, created_source)
  values (p_tenant_id, v_name, v_phone, v_email, 'manual')
  returning c.id, c.name, c.phone_e164, c.email
  into id, name, phone_e164, email;
  return next;
end
$$;
revoke all on function public.pos_create_customer(uuid, text, text, text) from public, anon;
grant execute on function public.pos_create_customer(uuid, text, text, text) to authenticated;
