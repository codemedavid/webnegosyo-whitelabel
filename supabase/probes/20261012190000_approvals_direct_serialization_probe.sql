-- Probe for 20261012190000_approvals_direct_serialization.sql. Catalog reads
-- only (no rows written); RAISEs on the first failure. Run after applying.
--
-- Asserts:
--  1. approval_direct_lock_key exists, is not executable by anon/authenticated;
--  2. create_and_execute_approval and order_refund_insert_check take the
--     per-person advisory lock, the latter refuses outside app_user_may_see_order;
--  3. the service role holds no TRUNCATE on store_activity / order_payments /
--     order_revisions, and no UPDATE/DELETE on store_activity.

do $$
declare
  v_src text;
begin
  if to_regprocedure('public.approval_direct_lock_key(uuid, uuid)') is null then
    raise exception 'PROBE 1: approval_direct_lock_key(uuid, uuid) missing';
  end if;
  if has_function_privilege('anon', 'public.approval_direct_lock_key(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.approval_direct_lock_key(uuid, uuid)', 'execute') then
    raise exception 'PROBE 1: approval_direct_lock_key is executable by a client role';
  end if;

  select prosrc into v_src from pg_proc
   where oid = 'public.create_and_execute_approval(uuid, uuid, text, text, jsonb, text, text, text)'::regprocedure;
  if v_src !~* 'pg_advisory_xact_lock\s*\(\s*public\.approval_direct_lock_key' or v_src !~* 'for\s+update' then
    raise exception 'PROBE 2: create_and_execute_approval does not lock before quoting';
  end if;

  select prosrc into v_src from pg_proc
   where oid = 'public.order_refund_insert_check(uuid, numeric, boolean)'::regprocedure;
  if v_src !~* 'pg_advisory_xact_lock\s*\(\s*public\.approval_direct_lock_key'
     or v_src !~* 'app_user_may_see_order\s*\(\s*v_tenant\s*,\s*v_outlet\s*\)' then
    raise exception 'PROBE 2: order_refund_insert_check lacks the person lock or the branch rule';
  end if;

  if has_table_privilege('service_role', 'public.store_activity', 'truncate')
     or has_table_privilege('service_role', 'public.store_activity', 'update')
     or has_table_privilege('service_role', 'public.store_activity', 'delete')
     or has_table_privilege('service_role', 'public.order_payments', 'truncate')
     or has_table_privilege('service_role', 'public.order_revisions', 'truncate') then
    raise exception 'PROBE 3: the service role can still truncate/rewrite an append-only ledger';
  end if;

  raise notice 'PROBE OK: 20261012190000_approvals_direct_serialization';
end;
$$;
