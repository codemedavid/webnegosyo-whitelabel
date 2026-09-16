# Admin and storefront crash investigation — 2026-09-14

The exact exception behind the reported production incidents is still unknown.
The Next.js “client-side exception” screen is a fallback, not a diagnosis.

## Evidence

- The public homepage returned HTTP 200 and its 16 script assets were fetched
  successfully during inspection. This does not reproduce authenticated admin
  navigation or prove that an older open tab can load its chunks.
- The deployed initialization bundle
  `/_next/static/chunks/bdfd76159a6f6a19.js?dpl=dpl_H49t8gQScuATqiWT5HQki91v1jTY`
  initializes Sentry with `dsn:T.default.env.NEXT_PUBLIC_SENTRY_DSN`, rather than
  an inlined DSN. No Sentry ingestion host was found in the homepage scripts.
  This strongly indicates the browser DSN was missing during the deployed build.
  A local `.env.local` value does not establish that Vercel received it.
- That bundle also contains the broad error filters in `src/lib/sentry-filtering.ts`.
  Tests reproduced that these discard module-factory errors, failed dynamic
  imports, ordinary failed fetches, and application errors with Turbopack frames.
  The production build itself uses Turbopack, so these are not necessarily dev noise.
- Admin and Convex error boundaries previously only wrote console messages.
  The production compiler removes application console calls. These boundaries
  had no explicit Sentry capture.
- There was no tenant or app segment error boundary. Storefront and layout
  failures could reach the generic global screen.
- Tests reproduced two additional containment defects: Convex construction
  happened outside its boundary, and an analytics-provider failure could replace
  the storefront with `null`. These are confirmed code defects, not proven causes
  of the reported production incidents.
- The configured Sentry token returned HTTP 403 for the read-only project issues
  endpoint. No browser was available through the browser integration. No production
  issue stack, event, or authenticated admin reproduction was obtained.

## Changes

- Preserve module and network exceptions. Keep development delivery disabled and
  retain ResizeObserver/extension filtering.
- Tag browser events with `appSurface` and, for identifiable path-based tenant
  routes, `tenantSlug`. Custom-domain events still retain their normal Sentry URL;
  no tenant is guessed from a custom hostname. The added tags do not copy query
  parameters, customer details, or form values.
- Capture admin, tenant, app, global, and Convex boundary failures, including a
  server digest when available and React component stacks for Convex failures.
- Provide retry/reload recovery at the route and global levels.
- Catch Convex initialization failures and retain storefront content when its
  optional analytics provider fails.
- Require `NEXT_PUBLIC_SENTRY_DSN` in the existing prebuild validation. Server and
  edge initialization fall back to that DSN when `SENTRY_DSN` is absent. Align the
  edge config actually imported by instrumentation with the production-only gate.

## Deployment and verification

1. Set `NEXT_PUBLIC_SENTRY_DSN` in the hosting project's Production build
   environment (and Preview if monitored). Use the project's browser DSN, never
   the auth token. Rebuild/redeploy; setting it after a build cannot fix that bundle.
2. Confirm the build runs the existing `npm run build`/prebuild validation.
   Invoking `next build` directly bypasses the npm prebuild script.
3. Ensure the build has `SENTRY_AUTH_TOKEN` with source-map upload access for
   `webnegosyo/javascript-nextjs`. Issue-reading access is a separate requirement;
   the observed 403 does not establish whether uploads work.
4. On a preview deployment, trigger a controlled exception in a temporary test
   route and verify the `/monitoring` request, the received Sentry event, readable
   stack, `appSurface`, boundary tag, and retry/reload behavior. Remove the test
   route afterward. Check an admin page and a storefront/custom-domain page.
5. Obtain an actual failing store URL, action, timestamp, and console stack or
   Sentry event to distinguish chunk/deployment failures from data/render failures.

No deployment or production test event was created during this investigation.
Existing trace/replay sampling and PII options were left in place. Restoring
previously discarded errors may increase Sentry event volume.

## Local validation

Six focused suites passed (29 tests), covering filtering, build configuration,
route recovery, Convex containment, and existing inventory reporting. ESLint
passed on changed TypeScript files. `git diff --check` passed.

Repository-wide TypeScript checking fails in unrelated test fixtures and a
generated MCP OAuth route type; none of the diagnostics names a changed file in
this work. A clean full production build and live Sentry delivery are not verified.
