-- Per-staff default screen: the merchant-app screen an account opens on.
--
-- Stored as the app's route name (e.g. 'pos', 'kitchen') rather than an enum
-- or a FK, deliberately. The set of screens is an app-side concept that gains
-- and retires members with every release, and a database constraint on it
-- would turn a routine tab rename into a migration-ordering problem — the app
-- and this schema deploy independently. Validity is enforced in code on both
-- sides instead: the web refuses to store a screen the account cannot open
-- (src/lib/staff-default-screen.ts), and the app re-checks at launch and falls
-- back when the value has gone stale (webnegosyo-app/lib/default-landing.ts).
--
-- NULL means "let the app decide", which is what every existing row gets and
-- what every account behaves as today.

alter table public.app_users
  add column if not exists default_tab text;

comment on column public.app_users.default_tab is
  'Merchant-app screen this account opens on (app/(main) route name). NULL = app default.';
