-- Automated store onboarding for the ₱999/month funnel.
--
-- A buyer who submits the funnel order form answers a short set-up wizard
-- (logo, menu photos, best sellers, payments, hours). The platform then builds
-- the store end to end — branding, menu, Boost offers, a live loyalty card —
-- while the store stays in PRE-LAUNCH: visible to its owner, refusing orders,
-- until the platform confirms the payment.
--
-- 1. tenants.is_prelaunch — the pre-launch switch. Read by the same
--    "is this store taking orders" verdict as operating hours, so every
--    storefront surface and the server-side order guard honour it. It is a
--    PRIVILEGED column: a merchant must not lift it themselves without paying.
-- 2. store_onboardings — one row per checkout lead: the wizard answers, the
--    uploaded assets, per-step progress, and a hashed bearer token. The token
--    is the buyer's only key to the wizard (the lead's reference number has
--    ~20 bits of entropy per day and is not a secret). Service-role only.
-- 3. checkout_leads.tenant_id — which store a paid lead became.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_prelaunch boolean NOT NULL DEFAULT false;

ALTER TABLE public.checkout_leads
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS checkout_leads_tenant_id_idx ON public.checkout_leads (tenant_id);

CREATE TABLE IF NOT EXISTS public.store_onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_lead_id uuid NOT NULL UNIQUE REFERENCES public.checkout_leads(id) ON DELETE CASCADE,
  tenant_id uuid UNIQUE REFERENCES public.tenants(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_details'
    CHECK (status IN ('awaiting_details', 'queued', 'running', 'ready', 'failed')),
  input jsonb,
  assets jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  launch_requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_onboardings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_onboardings FROM anon, authenticated;

DROP TRIGGER IF EXISTS store_onboardings_set_updated_at ON public.store_onboardings;
CREATE TRIGGER store_onboardings_set_updated_at
  BEFORE UPDATE ON public.store_onboardings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Same guard as 20260929120000, plus is_prelaunch.
CREATE OR REPLACE FUNCTION public.guard_tenant_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  privileged constant text[] := array[
    'id', 'created_at', 'domain', 'slug', 'is_active', 'is_prelaunch',
    'pending_domain', 'pending_domain_token', 'pending_domain_claimed_at',
    'domain_verified_at', 'domain_vercel_names',
    'mapbox_enabled', 'enable_order_management', 'lalamove_enabled',
    'menu_engineering_enabled', 'bundles_enabled', 'pairing_rules_enabled',
    'app_enabled', 'inventory_enabled', 'modifier_groups_enabled',
    'multi_branch_enabled', 'max_outlets', 'max_staff_per_branch',
    'loyverse_enabled', 'mcp_enabled', 'presell_enabled',
    'customer_hub_enabled', 'loyalty_enabled', 'loyalty_shadow',
    'qr_handoff_enabled', 'ios_app_store_id', 'android_package_name',
    'messenger_page_id', 'storefront_pack', 'beta_designs_enabled',
    'convex_deployment_url', 'convex_schema_version',
    'convex_auth_enforced', 'convex_public_reads',
    'order_backend', 'supabase_order_url', 'supabase_order_anon_key',
    'supabase_order_service_key', 'supabase_order_db_url',
    'supabase_order_schema_version'
  ];
  old_row jsonb;
  new_row jsonb;
  col text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid() and au.role = 'superadmin'
  ) then
    return new;
  end if;

  old_row := to_jsonb(old);
  new_row := to_jsonb(new);

  foreach col in array privileged loop
    if (new_row -> col) is distinct from (old_row -> col) then
      raise exception 'Only a platform administrator can change tenants.%', col
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$function$;
