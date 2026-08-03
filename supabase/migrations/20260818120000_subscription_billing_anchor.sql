-- The date a client's subscription month turns over.
--
-- Until now a payment always bought a month starting the day it was recorded,
-- so a merchant who paid late on the 20th moved their renewal date to the 20th
-- forever. The platform owner knows when each client actually started — "they
-- came on board on 1 August" — and that date is what the month should hang off.
--
-- WHY NOT `started_at`: that column already exists on this table, and it is not
-- this. It defaults to now() and the subscriptions migration backfilled it for
-- every tenant on the platform in one statement, so it records when the ROW was
-- created, not when the CLIENT joined. Reusing it would hand all ~170 tenants a
-- billing anchor of the day subscriptions shipped. It stays as the audit stamp
-- it is.
--
-- NULLABLE, AND NOT BACKFILLED. A null anchor means "no anchor", and every
-- billing code path falls back to exactly the behaviour that is live today:
-- periods start the day the merchant pays. That is what makes this safe to
-- deploy against a platform where nobody has an anchor yet — the feature is
-- inert until the owner sets a date, tenant by tenant. Guessing an anchor from
-- `paid_through` would silently re-date every client's renewal at once.
--
-- WHAT SETTING IT DOES NOT DO: grant access. It never moves `paid_through` or
-- `status`. Money buys access; this only decides which month the money buys.
-- See setBillingAnchor in src/lib/billing/subscription-lifecycle.ts.

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS billing_anchor_date date;

COMMENT ON COLUMN public.tenant_subscriptions.billing_anchor_date IS
  'The date this client''s month turns over, e.g. 2026-08-01 for a client who '
  'started on the 1st. NULL means no anchor: periods start the day the '
  'merchant pays, which is the pre-anchor behaviour and the default for every '
  'existing tenant. Distinct from started_at, which is a row-creation stamp '
  'backfilled for all tenants when subscriptions shipped. Grants no access on '
  'its own. See resolveAnchoredPeriod in src/lib/billing/billing-anchor.ts.';

-- No new RLS policy: the existing tenant_subscriptions_write_superadmin policy
-- is FOR ALL and already covers this column, and the read policy already lets a
-- tenant's own admins see their row.

-- Rollback:
--   ALTER TABLE public.tenant_subscriptions DROP COLUMN billing_anchor_date;
-- Dropping it restores today's behaviour exactly. The column is read through
-- one pure function that treats a missing or unparseable anchor as absent, so
-- nothing throws in the window between the drop and the deploy.
