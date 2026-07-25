-- Staff management: per-feature permissions on app_users + owner flag.
--
-- Staff members are role='admin' rows with is_owner=false and an explicit
-- permissions list. permissions NULL means full access (legacy admins and
-- owners). Staff accounts are created/managed only by the tenant owner via
-- the web admin, which uses the service role — there are intentionally no
-- INSERT/UPDATE/DELETE RLS policies on app_users for regular users.

alter table public.app_users
  add column if not exists is_owner boolean not null default false,
  add column if not exists permissions text[] default null,
  add column if not exists display_name text,
  add column if not exists email text;

-- Backfill: the earliest admin of each tenant becomes its owner.
update public.app_users au
set is_owner = true
where au.role = 'admin'
  and au.tenant_id is not null
  and au.created_at = (
    select min(x.created_at)
    from public.app_users x
    where x.tenant_id = au.tenant_id and x.role = 'admin'
  );

-- Backfill: denormalize the login email so staff lists can render it
-- without reading auth.users.
update public.app_users au
set email = u.email
from auth.users u
where u.id = au.user_id
  and au.email is null;

-- Backstop for the application-level limit: at most 3 non-owner staff per
-- tenant. The web admin enforces this too; the trigger guards against
-- races and out-of-band inserts.
create or replace function public.enforce_staff_limit()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' and new.is_owner = false and new.tenant_id is not null then
    if (
      select count(*)
      from public.app_users
      where tenant_id = new.tenant_id
        and role = 'admin'
        and is_owner = false
        and user_id <> new.user_id
    ) >= 3 then
      raise exception 'Staff limit reached: a tenant may have at most 3 staff accounts';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_enforce_staff_limit on public.app_users;
create trigger app_users_enforce_staff_limit
  before insert or update on public.app_users
  for each row
  execute function public.enforce_staff_limit();
