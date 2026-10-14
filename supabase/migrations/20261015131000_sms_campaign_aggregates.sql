-- Two aggregate reads for web Texts, so the page never downloads rows to count them.
--
-- 1. sms_campaign_run_progress(p_tenant, p_run_ids) — the live poll (every
--    10–30 s) needs sent / waiting / not-sent per open run. One grouped read,
--    served by sms_outbox_campaign_run_idx (campaign_run_id, status), instead
--    of 3 head counts per open run.
-- 2. sms_texts_came_back(p_tenant, p_since, p_window_days, p_exact) — the
--    "Last 30 days" line: guests texted since p_since (automations +
--    campaigns, server + phone), and how many ordered within p_window_days of
--    their FIRST text, with that first order's total. p_exact = the store's
--    orders live on the platform DB; otherwise customers.last_order_at inside
--    the window (a lower bound, no sales).
--
-- Both are service-role only (the web calls them after its own access check),
-- security definer with a fixed search_path, tenant-scoped by argument.
-- Safety: additive (two new functions).

create or replace function public.sms_campaign_run_progress(p_tenant uuid, p_run_ids uuid[])
returns table (campaign_run_id uuid, status text, n bigint)
language sql stable security definer set search_path = public as $$
  select o.campaign_run_id, o.status, count(*)::bigint
  from public.sms_outbox o
  where o.tenant_id = p_tenant and o.campaign_run_id = any (p_run_ids)
  group by o.campaign_run_id, o.status
$$;
revoke all on function public.sms_campaign_run_progress(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.sms_campaign_run_progress(uuid, uuid[]) to service_role;

create or replace function public.sms_texts_came_back(p_tenant uuid, p_since timestamptz, p_window_days integer, p_exact boolean)
returns table (came_back bigint, sales numeric)
language sql stable security definer set search_path = public as $$
  with texted as (
    select t.customer_id, min(t.sent_at) as first_sent
    from (
      select o.customer_id, o.sent_at from public.sms_outbox o
        where o.tenant_id = p_tenant and o.status = 'sent' and o.sent_at >= p_since
      union all
      select s.customer_id, s.sent_at from public.sms_sends s
        where s.tenant_id = p_tenant and s.result = 'sent' and s.sent_at >= p_since and s.customer_id is not null
    ) t
    group by t.customer_id
  ),
  exact as (
    select (
      select o.total from public.orders o
      where o.tenant_id = p_tenant and o.customer_id = x.customer_id and o.status <> 'cancelled'
        and o.created_at > x.first_sent and o.created_at <= x.first_sent + make_interval(days => p_window_days)
      order by o.created_at, o.id limit 1
    ) as total
    from texted x
    where p_exact
  ),
  approximate as (
    select 0::numeric as total
    from texted x join public.customers c on c.id = x.customer_id and c.tenant_id = p_tenant
    where not p_exact
      and c.last_order_at > x.first_sent and c.last_order_at <= x.first_sent + make_interval(days => p_window_days)
  ),
  backs as (
    select total from exact where total is not null
    union all
    select total from approximate
  )
  select count(*)::bigint, coalesce(sum(total), 0)::numeric from backs
$$;
revoke all on function public.sms_texts_came_back(uuid, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.sms_texts_came_back(uuid, timestamptz, integer, boolean) to service_role;

-- ------------------------------------------------------------------------------
-- PROBES (after applying):
--   select proname, prosecdef, proconfig from pg_proc
--     where proname in ('sms_campaign_run_progress', 'sms_texts_came_back');            -- 2 rows, prosecdef = t, search_path=public
--   select has_function_privilege('authenticated', 'public.sms_campaign_run_progress(uuid, uuid[])', 'execute');  -- false
--   select has_function_privilege('anon', 'public.sms_texts_came_back(uuid, timestamptz, integer, boolean)', 'execute'); -- false
--   select * from public.sms_campaign_run_progress('<tenant>', array['<open run id>']::uuid[]);
--     -- compare with: select status, count(*) from sms_outbox where campaign_run_id = '<open run id>' group by 1;
--   select * from public.sms_texts_came_back('<platform tenant>', now() - interval '30 days', 14, true);
--   explain analyze select * from public.sms_texts_came_back('<busiest tenant>', now() - interval '30 days', 14, true);
--     -- expect index use on sms_outbox (tenant, …) / orders_customer_id_idx; well under 1 s
-- ROLLBACK (manual): drop function public.sms_campaign_run_progress(uuid, uuid[]);
--                    drop function public.sms_texts_came_back(uuid, timestamptz, integer, boolean);
-- ------------------------------------------------------------------------------
