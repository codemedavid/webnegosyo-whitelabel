-- Public merchant signup requests submitted from the WebNegosyo Admin app
-- (and any public surface). This is an open, self-service onboarding intake:
-- anyone can request a store, demonstrating the app is available to the
-- general public rather than a fixed/enterprise set of organizations.

create table if not exists public.app_signup_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  business_type text,
  message text,
  source text not null default 'merchant_app',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.app_signup_requests enable row level security;

-- Anyone (including unauthenticated app users) may submit a request.
drop policy if exists "anyone can submit signup request" on public.app_signup_requests;
create policy "anyone can submit signup request"
  on public.app_signup_requests
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT/UPDATE/DELETE policies: requests are private and only readable
-- by the service role (superadmin tooling bypasses RLS).
