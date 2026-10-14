-- Sending phones for the web "Texts" page (/admin/texts).
--
-- 1. sms_sender_devices: what the web knows about each enrolled sending phone
--    beyond its credential: an owner-set label and what the phone reports
--    about itself (model, Android and app versions, SMS permission, whether
--    battery saver leaves the app alone). The phone reports through the
--    `x-wn-phone-info` header on its outbox claim, AFTER the claim RPC has
--    authenticated the device credential, so a forged header cannot write.
--    The phone never touches `label`.
-- 2. record_sms_sender_info: the only writer of the info columns. Re-checks
--    that the device is enabled and belongs to the store, and writes only
--    when something changed or the last report is over 6 hours old.
-- 3. list_sms_sender_devices: one jsonb array, one object per ENABLED phone,
--    with heartbeat, enrolment (from the audit log, so phones enrolled before
--    this migration need no backfill), who enrolled it, and today's counters
--    across automated texts (sms_outbox) and reward codes (loyalty_sms_outbox).
--
-- Service role only: the web reads after its own `customers` + store-wide
-- check (src/lib/texts/gate.ts). Purely additive; rollback at the bottom.

create table public.sms_sender_devices (
  device_id uuid primary key references public.loyalty_sms_devices(device_id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Owner-set; never written by the phone.
  label text check (label is null or char_length(btrim(label)) between 1 and 40),
  manufacturer text check (char_length(manufacturer) <= 40),
  model text check (char_length(model) <= 60),
  os_version text check (char_length(os_version) <= 20),
  app_version text check (char_length(app_version) <= 20),
  sms_permission boolean,
  -- true = battery saver is NOT restricting the app (Android "Unrestricted").
  ignoring_battery_opt boolean,
  info_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sms_sender_devices_tenant_idx on public.sms_sender_devices(tenant_id);
create trigger sms_sender_devices_set_updated_at before update on public.sms_sender_devices
  for each row execute function public.set_updated_at();
alter table public.sms_sender_devices enable row level security;
revoke all on public.sms_sender_devices from public, anon, authenticated;
grant select, insert, update, delete on public.sms_sender_devices to service_role;

-- Bounded, control-character-free text (defence in depth; the web cleans first).
create function public.sms_sender_clean_text(p_value text, p_max integer)
returns text language sql immutable set search_path = public as $$
  select left(nullif(btrim(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]]', '', 'g')), ''), p_max)
$$;
revoke all on function public.sms_sender_clean_text(text, integer) from public, anon, authenticated;
grant execute on function public.sms_sender_clean_text(text, integer) to service_role;

create function public.record_sms_sender_info(
  p_tenant_id uuid, p_device_id uuid,
  p_manufacturer text, p_model text, p_os text, p_app text,
  p_sms boolean, p_bat boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  existing public.sms_sender_devices%rowtype;
  v_manufacturer text := public.sms_sender_clean_text(p_manufacturer, 40);
  v_model text := public.sms_sender_clean_text(p_model, 60);
  v_os text := public.sms_sender_clean_text(p_os, 20);
  v_app text := public.sms_sender_clean_text(p_app, 20);
begin
  perform 1 from public.loyalty_sms_devices d
    where d.device_id = p_device_id and d.tenant_id = p_tenant_id and d.enabled is true;
  if not found then return false; end if;

  select * into existing from public.sms_sender_devices where device_id = p_device_id;
  -- A field the phone could not read this time keeps what it said last time.
  v_manufacturer := coalesce(v_manufacturer, existing.manufacturer);
  v_model := coalesce(v_model, existing.model);
  v_os := coalesce(v_os, existing.os_version);
  v_app := coalesce(v_app, existing.app_version);
  if existing.device_id is not null
    and existing.info_reported_at > now() - interval '6 hours'
    and (existing.manufacturer, existing.model, existing.os_version, existing.app_version,
         existing.sms_permission, existing.ignoring_battery_opt)
      is not distinct from
        (v_manufacturer, v_model, v_os, v_app,
         coalesce(p_sms, existing.sms_permission), coalesce(p_bat, existing.ignoring_battery_opt))
  then
    return false;
  end if;

  insert into public.sms_sender_devices as s(
    device_id, tenant_id, manufacturer, model, os_version, app_version,
    sms_permission, ignoring_battery_opt, info_reported_at)
  values (p_device_id, p_tenant_id, v_manufacturer, v_model, v_os, v_app, p_sms, p_bat, now())
  on conflict (device_id) do update set
    tenant_id = excluded.tenant_id,
    manufacturer = excluded.manufacturer,
    model = excluded.model,
    os_version = excluded.os_version,
    app_version = excluded.app_version,
    sms_permission = coalesce(excluded.sms_permission, s.sms_permission),
    ignoring_battery_opt = coalesce(excluded.ignoring_battery_opt, s.ignoring_battery_opt),
    info_reported_at = excluded.info_reported_at;
  return true;
end;
$$;
revoke all on function public.record_sms_sender_info(uuid, uuid, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_sms_sender_info(uuid, uuid, text, text, text, text, boolean, boolean)
  to service_role;

-- p_day_start = Manila midnight today (the web computes it; the server clock decides).
create function public.list_sms_sender_devices(p_tenant_id uuid, p_day_start timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'device_id', d.device_id,
      'label', s.label,
      'manufacturer', s.manufacturer,
      'model', s.model,
      'os_version', s.os_version,
      'app_version', s.app_version,
      'sms_permission', s.sms_permission,
      'ignoring_battery_opt', s.ignoring_battery_opt,
      'info_reported_at', s.info_reported_at,
      'last_seen_at', h.last_seen_at,
      'enrolled_at', e.enrolled_at,
      'enrolled_by', coalesce(nullif(btrim(u.display_name), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), '')),
      'sent_today', coalesce(o.sent_today, 0) + coalesce(l.sent_today, 0),
      'failed_today', coalesce(o.failed_today, 0) + coalesce(l.failed_today, 0),
      'claimed_now', coalesce(o.claimed_now, 0) + coalesce(l.claimed_now, 0)
    ) order by e.enrolled_at nulls last, d.device_id), '[]'::jsonb)
  from public.loyalty_sms_devices d
  left join public.sms_sender_devices s on s.device_id = d.device_id and s.tenant_id = d.tenant_id
  left join public.loyalty_sms_device_heartbeats h on h.device_id = d.device_id and h.tenant_id = d.tenant_id
  -- One row per person today; LIMIT 1 keeps the list one-per-phone even if that changes.
  left join lateral (
    select au.display_name, au.email from public.app_users au where au.user_id = d.actor_id limit 1
  ) u on true
  left join lateral (
    select min(a.created_at) as enrolled_at from public.loyalty_sms_device_audit a
    where a.device_id = d.device_id and a.tenant_id = d.tenant_id and a.action = 'enrolled'
  ) e on true
  -- sms_outbox_device_dispatch_idx (claimed_by_device, dispatch_started_at). A claim
  -- older than a day has long been swept, so the window bounds the scan.
  left join lateral (
    select
      count(*) filter (where x.status = 'sent' and coalesce(x.sent_at, x.dispatch_started_at) >= p_day_start) as sent_today,
      count(*) filter (where x.status = 'failed' and x.dispatch_started_at >= p_day_start) as failed_today,
      count(*) filter (where x.status = 'claimed') as claimed_now
    from public.sms_outbox x
    where x.claimed_by_device = d.device_id and x.tenant_id = d.tenant_id
      and x.dispatch_started_at >= p_day_start - interval '1 day'
  ) o on true
  left join lateral (
    select
      count(*) filter (where y.status = 'sent' and y.sent_at >= p_day_start) as sent_today,
      count(*) filter (where y.status = 'failed'
        and coalesce(y.dispatch_started_at, y.claimed_at, y.updated_at) >= p_day_start) as failed_today,
      count(*) filter (where y.status = 'claimed') as claimed_now
    from public.loyalty_sms_outbox y
    where y.tenant_id = d.tenant_id and y.claimed_by_device = d.device_id::text
      and y.created_at >= p_day_start - interval '1 day'
  ) l on true
  where d.tenant_id = p_tenant_id and d.enabled is true
$$;
revoke all on function public.list_sms_sender_devices(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.list_sms_sender_devices(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Probes (run after apply, via Supabase MCP execute_sql):
--
--   select to_regclass('public.sms_sender_devices');                         -- not null
--   select relrowsecurity from pg_class where oid = 'public.sms_sender_devices'::regclass;  -- true
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'sms_sender_devices';                                -- service_role only
--   select p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--          has_function_privilege('anon', p.oid, 'execute') as anon_exec
--     from pg_proc p where p.proname in ('record_sms_sender_info','list_sms_sender_devices','sms_sender_clean_text');
--     -- auth_exec = false, anon_exec = false for all three
--   select public.list_sms_sender_devices('<tenant uuid>',
--     date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
--     -- one object per enabled phone; enrolled_at set for every phone enrolled since 2026-09-09
--   -- As the service role, against an enabled device of a test store:
--   select public.record_sms_sender_info('<tenant>', '<device>', 'samsung', 'SM-A155F', '14', '1.0.13', true, false); -- true
--   select public.record_sms_sender_info('<tenant>', '<device>', 'samsung', 'SM-A155F', '14', '1.0.13', true, false); -- false (unchanged < 6h)
--   select public.record_sms_sender_info('<tenant>', gen_random_uuid(), 'x', 'y', '1', '1', true, true);              -- false (unknown device)
--   -- As authenticated: `select * from public.sms_sender_devices` and calling either function must fail (42501).
--
-- Rollback:
--   drop function if exists public.list_sms_sender_devices(uuid, timestamptz);
--   drop function if exists public.record_sms_sender_info(uuid, uuid, text, text, text, text, boolean, boolean);
--   drop function if exists public.sms_sender_clean_text(text, integer);
--   drop table if exists public.sms_sender_devices;
