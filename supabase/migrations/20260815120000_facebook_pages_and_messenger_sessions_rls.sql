-- Close the public read on Facebook access tokens and Messenger sessions.
--
-- `facebook_pages` held `page_access_token` and `user_access_token` with RLS
-- disabled and SELECT granted to `anon`. The anon key ships in the browser
-- bundle, so anyone could GET /rest/v1/facebook_pages and read every tenant's
-- token — enough to post as their page and read their conversations.
-- `messenger_sessions` was the same, exposing customer PSIDs and cart contents.
--
-- The grant existed because every server route that needed a token asked
-- through the SSR client, which runs as `anon` on an unauthenticated request
-- such as the Facebook webhook. Those reads now go through the service-role
-- client (`src/lib/facebook/page-tokens.ts`), so the grant can go.
--
-- One anon read is kept on purpose: checkout resolves a page_id in the browser
-- to build the Messenger redirect. A Facebook page id is public information —
-- it is in the page's own URL — so it stays readable, and the secrets are
-- removed with a column-level grant rather than a row policy, because RLS
-- cannot hide a column.

-- ── facebook_pages ─────────────────────────────────────────────────────────

ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

-- Replace the whole-table grant with one naming every column except the two
-- tokens. `anon` keeps exactly what the checkout redirect needs.
REVOKE SELECT ON public.facebook_pages FROM anon;
GRANT SELECT (id, tenant_id, page_id, page_name, is_active, created_at, updated_at)
  ON public.facebook_pages TO anon;

-- Scoped to `anon` on purpose. A permissive policy is OR'd with the admin one
-- below, so leaving this open to every role would let any signed-in merchant
-- read any active page — and `authenticated` keeps column access to the tokens,
-- which it needs to read back its own row after connecting a page. Restricting
-- the public read to `anon` is what stops that becoming a cross-tenant leak.
--
-- The cost is narrow and accepted: a merchant who is signed in to their own
-- admin and then visits a *different* tenant's storefront falls back to
-- `tenants.messenger_*` for the redirect instead of this lookup. Customers,
-- who are anonymous, are unaffected.
DROP POLICY IF EXISTS facebook_pages_read_active ON public.facebook_pages;
CREATE POLICY facebook_pages_read_active ON public.facebook_pages
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = facebook_pages.tenant_id AND t.is_active = true
    )
  );

-- Note the `au.tenant_id = facebook_pages.tenant_id` comparison. The equivalent
-- policies on `order_types` and `payment_methods` compare `au.tenant_id` to
-- itself, which is always true and lets any admin write any tenant's rows.
-- That bug is not reproduced here.
DROP POLICY IF EXISTS facebook_pages_write_admin ON public.facebook_pages;
CREATE POLICY facebook_pages_write_admin ON public.facebook_pages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (au.role = 'admin' AND au.tenant_id = facebook_pages.tenant_id)
        )
    )
  );

-- ── messenger_sessions ─────────────────────────────────────────────────────

-- Nothing outside the service role touches this table: the webhook writes the
-- session and send-cart verifies a PSID, both now on the admin client. So it
-- is closed to the API roles outright rather than given a policy.
ALTER TABLE public.messenger_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.messenger_sessions FROM anon;
REVOKE ALL ON public.messenger_sessions FROM authenticated;
