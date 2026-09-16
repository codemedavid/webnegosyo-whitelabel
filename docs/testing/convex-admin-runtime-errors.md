# Convex admin runtime errors — 2026-09-14

## Reproduced causes

- `ConvexDashboardStats` used `StatsContent` as its error fallback. A fallback
  replaces the provider subtree, but `StatsContent` calls `useQuery`. A failed
  client initialization or query therefore caused a second exception, this time
  outside the boundary. The fallback now uses a view with no Convex hooks,
  preserving menu counts/navigation and marking live data unavailable.
- Migration `20260910120000` grants the auth hook SELECT on `app_users` without
  an RLS policy for `supabase_auth_admin`. Running that migration and the existing
  self-read policy in isolated Postgres reproduces empty membership claims for
  an admin. Convex classifies a valid identity without `wn_tenant_id` as
  `wrong_tenant`. Migration `20260914140000` allows the hook role to read those
  membership columns; normal caller policies and Convex tenant checks remain.
- The browser token callback ignored `forceRefreshToken`, returning the cached
  Supabase session even when Convex requested a new token. It now refreshes on
  request and when cached merchant claims are missing, before using that token
  for initial queries. Decoding the cached payload is only a refresh hint;
  authorization remains with Convex's signature and tenant checks.

Supabase explicitly requires an RLS policy for hook table access:
https://supabase.com/docs/guides/auth/auth-hooks#security-model
Convex requires its token callback to honor forced refresh:
https://docs.convex.dev/auth/advanced/custom-auth

## Verification

```sh
npx jest --config jest.config.cjs --runInBand \
  tests/unit/convex-dashboard-stats.test.tsx \
  tests/unit/safe-convex-provider-auth.test.tsx \
  tests/unit/safe-convex-provider-reporting.test.tsx \
  convex-template/convex/access.test.ts
```

For the isolated SQL regression, install `@electric-sql/pglite` into a temporary
directory and supply its `node_modules` directory through `NODE_PATH`, then run
`node tests/sql/run-convex-merchant-auth.cjs`. `--baseline` omits the repair and
must fail with empty claims. The repaired run checks merchant/superadmin claims,
MCP audience preservation, and denial of ordinary callers' hook access.

## Deployment and remaining verification

The user identified the affected session as a superadmin on localhost, viewing
Seacook. Read-only checks confirmed Seacook's platform tenant ID matches the
deployment's `tenant_id`; both have auth enforcement disabled. Soft enforcement
still rejects an authenticated identity missing its tenant claim, whereas a
`wn_role: superadmin` identity is admitted regardless of tenant. This rules out
a mismatched deployment tenant ID in the checked configuration.

The browser runtime reported no available browser, so the actual session claims
could not be inspected. The configured Supabase MCP connection failed its
initialization with `Auth required`, blocking live migration execution. The
available Supabase service-role client supports data reads, not applying SQL
migrations. Reconnect the Supabase integration to apply and verify the repair.

Apply `supabase/migrations/20260914140000_convex_auth_hook_rls.sql` to the target
Supabase project and deploy the web changes. The migration and deployment have
not been run against a live environment in this investigation. Confirm that
`public.superadmin_mcp_access_token_hook` remains the configured access-token hook.
Reload the affected admin tab to initialize the repaired client and refresh its
old claims. Check dashboard stats and loading/saving a product cost for both a
store admin and a superadmin. Do not disable Convex authorization to bypass this.

No independent hook-order violation was found by ESLint in the admin components,
hooks, app routes, or storefront components. The real Convex React hooks survive
the tested live-query failure and provider remount under StrictMode without a
hook-order exception. The reported standalone “Rendered more hooks” error lacks
a component stack and was not reproduced; it is not independently resolved.
Capture its full stack, route, and triggering action if it remains after reload.

Repository-wide `tsc --noEmit` still fails on unrelated test fixtures and a
generated MCP OAuth route type. The changed runtime files have no diagnostics.
