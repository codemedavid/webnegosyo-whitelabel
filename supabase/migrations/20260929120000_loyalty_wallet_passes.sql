-- Apple Wallet / Google Wallet loyalty cards.
--
-- One pass per member per programme. The pass carries only `serial_number`
-- (random, 144 bits); `customer_key` (phone:+63…) never leaves the server.
-- Service-role only: RLS on with no policies, and the API roles are revoked.
--
-- Keeping cards current: a balance or reward change for a member who HAS a
-- pass (or a change to the programme itself) posts the pass/programme id to
-- /api/loyalty/passes/sync via pg_net. The route trusts nothing but the id,
-- re-reads the ledger, and skips devices when the rendered card did not change.
-- Because a programme id fans out to every card on it, the call also carries a
-- shared secret read from Supabase Vault (never written into this file):
--   select vault.create_secret('<same value as WALLET_PASS_SYNC_SECRET>', 'wallet_pass_sync_secret');
-- Without that secret the triggers post nothing, and the route refuses anyway.

create table public.loyalty_wallet_passes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  customer_key text not null check (customer_key ~ '^phone:\+[0-9]{8,15}$'),
  serial_number text not null unique check (serial_number ~ '^[A-Za-z0-9_-]{24}$'),
  -- sha256 of the rendered card; Apple's "passesUpdatedSince" tag is content_updated_at.
  content_hash text,
  content_updated_at timestamptz not null default now(),
  -- Last content hash each wallet was told about (null = never pushed).
  apple_pushed_hash text,
  google_synced_hash text,
  created_at timestamptz not null default now(),
  constraint loyalty_wallet_passes_member_uq unique (program_id, customer_key)
);

create index loyalty_wallet_passes_tenant_customer_idx
  on public.loyalty_wallet_passes(tenant_id, customer_key);

create table public.loyalty_wallet_apple_registrations (
  pass_id uuid not null references public.loyalty_wallet_passes(id) on delete cascade,
  device_library_id text not null check (device_library_id ~ '^[A-Za-z0-9]{1,128}$'),
  push_token text not null check (push_token ~ '^[A-Za-z0-9]{1,256}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_library_id, pass_id)
);

create index loyalty_wallet_apple_registrations_pass_idx
  on public.loyalty_wallet_apple_registrations(pass_id);

alter table public.loyalty_wallet_passes enable row level security;
alter table public.loyalty_wallet_apple_registrations enable row level security;
revoke all on public.loyalty_wallet_passes from public, anon, authenticated;
revoke all on public.loyalty_wallet_apple_registrations from public, anon, authenticated;
grant select, insert, update, delete on public.loyalty_wallet_passes to service_role;
grant select, insert, update, delete on public.loyalty_wallet_apple_registrations to service_role;

-- The shared secret for /api/loyalty/passes/sync, or null when not provisioned.
create or replace function public.loyalty_wallet_sync_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wallet_pass_sync_secret' limit 1;
$$;

revoke all on function public.loyalty_wallet_sync_secret() from public, anon, authenticated;

-- A member's balance or rewards moved: refresh their card, if they have one.
create or replace function public.loyalty_wallet_notify_member()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pass_id uuid;
  v_secret text;
begin
  select id into v_pass_id
    from public.loyalty_wallet_passes
   where program_id = new.program_id and customer_key = new.customer_key;
  if v_pass_id is null then
    return new;
  end if;
  v_secret := public.loyalty_wallet_sync_secret();
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/loyalty/passes/sync',
    body := jsonb_build_object('pass_id', v_pass_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Wallet-Sync-Secret', v_secret)
  );
  return new;
exception when others then
  -- Never fail a ledger write because a wallet refresh could not be queued.
  return new;
end;
$$;

-- The programme itself changed (paused, ended, renamed, new rules): refresh every card on it.
create or replace function public.loyalty_wallet_notify_program()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.loyalty_wallet_passes where program_id = new.id) then
    return new;
  end if;
  v_secret := public.loyalty_wallet_sync_secret();
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://www.webnegosyo.com/api/loyalty/passes/sync',
    body := jsonb_build_object('program_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Wallet-Sync-Secret', v_secret)
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.loyalty_wallet_notify_member() from public, anon, authenticated;
revoke all on function public.loyalty_wallet_notify_program() from public, anon, authenticated;

create trigger loyalty_balances_wallet_notify
  after insert or update of balance on public.loyalty_balances
  for each row execute function public.loyalty_wallet_notify_member();

create trigger loyalty_entitlements_wallet_notify
  after insert or update of status, expires_at on public.loyalty_entitlements
  for each row execute function public.loyalty_wallet_notify_member();

create trigger loyalty_programs_wallet_notify
  after update of name, status, ends_at, current_version_id on public.loyalty_programs
  for each row
  when (
    old.name is distinct from new.name
    or old.status is distinct from new.status
    or old.ends_at is distinct from new.ends_at
    or old.current_version_id is distinct from new.current_version_id
  )
  execute function public.loyalty_wallet_notify_program();
