-- White-label customer apps: one row per store that has (or is getting) its
-- own App Store / Play Store app, plus the runtime config the app reads.
--
-- A store build differs from another ONLY in its identity (name, bundle id,
-- package, icon, splash). Everything else — theme, home layout, banners, copy,
-- feature switches — is read at runtime from /api/app/v1/config, built from
-- tenant_app_configs.published over the store's own branding. So an appearance
-- change needs no rebuild and no store review.
--
-- The app finds its store from its NATIVE application id (iOS bundle id /
-- Android package) via /api/app/v1/resolve, never from the JS manifest, which
-- an over-the-air update replaces. bundle_id and android_package are therefore
-- unique across the platform.
--
-- Both tables are service-role only: the app never reads them directly (it
-- talks to /api/app/v1/*), and App Studio writes go through server actions
-- that check the caller is a superadmin / platform staff member first.

CREATE TABLE IF NOT EXISTS public.tenant_apps (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- The name under the icon and on the store listing (App Store caps it at 30).
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 30),
  bundle_id text NOT NULL UNIQUE
    CHECK (bundle_id ~ '^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$'),
  -- Android forbids hyphens and requires each segment to start with a letter.
  android_package text NOT NULL UNIQUE
    CHECK (android_package ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  -- Which developer accounts publish this app. Every app starts under
  -- WebNegosyo's own accounts; a store can move to its own later without a
  -- code change. Shape: {"apple": "webnegosyo" | "tenant", "google": ...}.
  store_account jsonb NOT NULL DEFAULT '{"apple": "webnegosyo", "google": "webnegosyo"}'::jsonb
    CHECK (jsonb_typeof(store_account) = 'object'),
  -- App Store Connect's numeric app id, pasted once after the app record exists.
  asc_app_id text CHECK (asc_app_id IS NULL OR asc_app_id ~ '^[0-9]{6,12}$'),
  play_track text NOT NULL DEFAULT 'internal'
    CHECK (play_track IN ('internal', 'alpha', 'beta', 'production')),
  -- Store listing copy (subtitle, description, keywords, support URL...).
  listing jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(listing) = 'object'),
  icon_url text CHECK (icon_url IS NULL OR icon_url ~ '^https://'),
  splash_url text CHECK (splash_url IS NULL OR splash_url ~ '^https://'),
  splash_background text CHECK (splash_background IS NULL OR splash_background ~ '^#[0-9A-Fa-f]{6}$'),
  -- draft: being set up; live: on at least one store; paused: the API answers
  -- this app with "unavailable" (e.g. unpaid subscription) without a release.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  -- Release gate: below min = must update; below latest = may update.
  min_version_ios text CHECK (min_version_ios IS NULL OR min_version_ios ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  latest_version_ios text CHECK (latest_version_ios IS NULL OR latest_version_ios ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  min_version_android text CHECK (min_version_android IS NULL OR min_version_android ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  latest_version_android text CHECK (latest_version_android IS NULL OR latest_version_android ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  app_store_url text CHECK (app_store_url IS NULL OR app_store_url ~ '^https://'),
  play_store_url text CHECK (play_store_url IS NULL OR play_store_url ~ '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_apps IS
  'One white-label customer app per store: store identity + release gate. Service role only.';

-- The runtime config App Studio edits. `draft` is what the editor holds;
-- `published` is what phones get. Publishing copies draft → published and
-- bumps published_version (the config ETag).
CREATE TABLE IF NOT EXISTS public.tenant_app_configs (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft) = 'object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published) = 'object'),
  published_version integer NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  published_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_app_configs IS
  'Customer app runtime config (home blocks, copy, font, corners): draft + published. Service role only.';

ALTER TABLE public.tenant_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_app_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_apps FROM anon, authenticated;
REVOKE ALL ON public.tenant_app_configs FROM anon, authenticated;
GRANT ALL ON public.tenant_apps TO service_role;
GRANT ALL ON public.tenant_app_configs TO service_role;

-- Rollback:
--   DROP TABLE IF EXISTS public.tenant_app_configs;
--   DROP TABLE IF EXISTS public.tenant_apps;
