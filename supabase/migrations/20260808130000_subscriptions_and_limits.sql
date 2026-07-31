-- Subscriptions (₱649/month) and the per-tenant allowances they buy.
--
-- Three things arrive together because they are one commercial fact: what a
-- merchant pays for, how much of the product that entitles them to, and what
-- happens when they stop paying.
--
--   1. `tenants.max_outlets` / `tenants.max_staff_per_branch` — allowances that
--      used to be constants in the TypeScript (`MAX_STAFF_PER_TENANT = 3`, and
--      no branch limit at all). Now facts about the tenant, so the platform
--      owner can sell a bigger allowance without a deploy.
--   2. `tenant_subscriptions` — one row per tenant. `paid_through` is the
--      whole gate; `status` is a summary for humans reading the table.
--   3. `subscription_payments` — an append-only ledger. This is what settles an
--      argument about whether August was paid.
--
-- There is deliberately NO plans table. One price point does not need a join,
-- and `monthly_price_php` sits on the subscription so an individual client can
-- be given a different number without any schema change at all.
--
-- WHAT PAUSING DOES NOT TOUCH: the customer storefront. `tenants.is_active`
-- remains the separate, harsher "switch this client off entirely" lever. An
-- unpaid merchant loses their admin and their app; they keep selling while they
-- settle up. Taking a restaurant's ordering page down over an unpaid ₱649 costs
-- them far more than it collects.

-- ---------------------------------------------------------------------------
-- 1. Allowances on the tenant
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_outlets integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_staff_per_branch integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.tenants.max_outlets IS
  'Branches this tenant may create. Enforced on CREATE only — a tenant above a '
  'lowered allowance keeps what it has. See assertOutletCapacity in '
  'src/lib/outlets/outlet-repository.ts.';

COMMENT ON COLUMN public.tenants.max_staff_per_branch IS
  'Staff seats per branch, excluding the owner. Replaces the hard-coded '
  'MAX_STAFF_PER_TENANT = 3. See resolveStaffLimit in '
  'src/lib/billing/subscription-status.ts.';

-- Backfill each tenant's branch allowance from what it ACTUALLY has, so nobody
-- wakes up over their limit. A tenant with four branches gets an allowance of
-- four, not the default of one.
UPDATE public.tenants t
SET max_outlets = GREATEST(1, (
  SELECT COUNT(*) FROM public.outlets o WHERE o.tenant_id = t.id
));

-- ---------------------------------------------------------------------------
-- 2. The subscription
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- trialing | active | past_due | paused | cancelled.
  -- A stored SUMMARY, not the gate: `resolveSubscriptionAccess` recomputes from
  -- the dates, so a row left stale at 'past_due' after payment still opens.
  -- Only 'paused' and 'cancelled' close the door on their own.
  status text NOT NULL DEFAULT 'trialing',
  monthly_price_php numeric(10, 2) NOT NULL DEFAULT 649,
  -- The last day the merchant has paid for. NULL means nobody has said when
  -- payment is owed — an unconfigured account, never a delinquent one.
  paid_through date,
  grace_days integer NOT NULL DEFAULT 3,
  started_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  CONSTRAINT tenant_subscriptions_grace_days_check CHECK (grace_days >= 0),
  CONSTRAINT tenant_subscriptions_price_check CHECK (monthly_price_php >= 0)
);

COMMENT ON TABLE public.tenant_subscriptions IS
  'One row per tenant. paid_through + grace_days is the access gate for the '
  'admin and the merchant app; the customer storefront is never gated here.';

-- Every existing tenant gets a month of runway rather than an immediate
-- lockout. Deploying a billing gate that blacks out the whole platform the
-- moment it lands is the one outcome worth spending a schema line to prevent.
INSERT INTO public.tenant_subscriptions (tenant_id, status, paid_through, notes)
SELECT
  t.id,
  'active',
  (CURRENT_DATE + INTERVAL '30 days')::date,
  'Backfilled when subscriptions shipped; 30 days runway before first payment.'
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The payment ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_php numeric(10, 2) NOT NULL,
  -- The period this payment bought. Consecutive periods tile without overlap.
  period_start date NOT NULL,
  period_end date NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  -- gcash | bank | cash | other. Free text rather than an enum so a gateway
  -- can write its own provider name here later without a migration.
  method text,
  -- Transfer reference number. The merchant quotes this when they dispute.
  reference text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_payments_amount_check CHECK (amount_php >= 0),
  CONSTRAINT subscription_payments_period_check CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS subscription_payments_tenant_paid_at_idx
  ON public.subscription_payments (tenant_id, paid_at DESC);

COMMENT ON TABLE public.subscription_payments IS
  'Append-only record of money received. Written BEFORE the subscription is '
  'extended, so access is never granted without a trace of what paid for it.';

-- ---------------------------------------------------------------------------
-- 4. RLS — a merchant may READ their bill and never write it
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Read: the tenant's own admins, so the paused screen can explain itself
-- instead of showing a dead end with nothing to act on.
DROP POLICY IF EXISTS tenant_subscriptions_select_own ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_select_own ON public.tenant_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin' OR au.tenant_id = tenant_subscriptions.tenant_id)
    )
  );

-- Write: superadmin ONLY. This is the security boundary of the whole feature.
-- Every tenant admin is role='admin' — including branch managers — so anything
-- looser than an explicit superadmin check would let a merchant mark
-- themselves paid and grant their own access indefinitely.
DROP POLICY IF EXISTS tenant_subscriptions_write_superadmin ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_write_superadmin ON public.tenant_subscriptions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
  );

DROP POLICY IF EXISTS subscription_payments_select_own ON public.subscription_payments;
CREATE POLICY subscription_payments_select_own ON public.subscription_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin' OR au.tenant_id = subscription_payments.tenant_id)
    )
  );

DROP POLICY IF EXISTS subscription_payments_write_superadmin ON public.subscription_payments;
CREATE POLICY subscription_payments_write_superadmin ON public.subscription_payments
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid() AND au.role = 'superadmin')
  );

COMMENT ON POLICY tenant_subscriptions_write_superadmin ON public.tenant_subscriptions IS
  'Superadmin-only. A tenant admin marking themselves paid would defeat the '
  'entire gate, and every tenant admin — branch managers included — is '
  'role=admin, so the tenant grant cannot be reused here.';

-- Rollback:
--   DROP TABLE public.subscription_payments;
--   DROP TABLE public.tenant_subscriptions;
--   ALTER TABLE public.tenants
--     DROP COLUMN max_outlets, DROP COLUMN max_staff_per_branch;
-- Dropping the tables restores today's behaviour exactly: with no subscription
-- row, resolveSubscriptionAccess returns 'active' for every tenant.
