# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant restaurant ordering SaaS platform ("WebNegosyo"). Merchants create white-labeled online menus; customers order via the web and orders are sent to the merchant's Facebook Messenger. Built with Next.js 15 App Router, Supabase, Convex, and TypeScript. The platform includes a Next.js web app, a white-labeled customer mobile app, and a merchant admin mobile app.

## Platform Supabase First (READ BEFORE ANY CHANGE)

Most tenants now run on the **shared platform Supabase**: `resolveOrderBackend(tenant) === 'platform'` (`src/lib/order-backend.ts`). Convex and per-tenant Supabase (`supabase`) are the minority/legacy paths, even though older code and comments treat platform as the "legacy default" or a fallback. **A change is not done until it works end-to-end on platform Supabase.**

- **Build the platform path first, then verify it.** Never ship something that only works on Convex, or that quietly no-ops or degrades on platform. If a feature touches orders, analytics, push, inventory, loyalty, delivery or the mobile apps, confirm that a platform branch exists and is actually exercised.
- **Route through `resolveOrderBackend`.** Never work out the backend from credentials yourself: a leftover `convex_deployment_url` on a platform tenant must not send reads or writes to Convex.
- **Merged migrations are not applied migrations.** A migration in `supabase/migrations/` counts only once it is applied to the platform project AND probed: check that the objects (columns, functions, policies, triggers) exist, not just the migration name. Then regenerate `src/types/database.ts` via the Supabase MCP. Record the result in `supabase/migration-status.json`.
- **Test RLS as the role that really runs the query**: anon (storefront/checkout), `authenticated` (admin/staff), service role. RLS refusals are usually silent (zero rows, `null`, a `RETURNING` that comes back empty), so assert affected rows instead of trusting "no error".
- **Respect platform limits**: page past the 1000-row API cap, keep queries indexed and bounded, and use the timed fetch on request paths. Every tenant shares this one database, so a slow query hurts every store.
- **Convex-only features need a platform equivalent.** Examples: Lalamove actions, push notifications, analytics events, cron aggregation. For the apps, read and write the platform DB directly, not through Convex functions.
- **Verify against the real platform database** (Supabase MCP `execute_sql`, logs, advisors), not only Jest mocks, before calling a backend change done.

## Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build (runs validate-env.mjs prebuild)
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit over src, tests and the sub-project sources the tests import
npm run verify           # lint + typecheck + test:sql + Jest for what changed since origin/main (CI runs the same three and the whole Jest suite)
npm run test             # Jest unit tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Coverage report
npm run test -- --testPathPatterns="cart-utils"  # Run a single test file (Jest 30: plural flag)
npm run test:property    # fast-check suites only (*.property.test.ts); FC_NUM_RUNS=5000 for the nightly depth
npm run test:sql         # every PGlite SQL runner in tests/sql (RLS/trigger checks over the real migrations)
```

Tests live in `tests/unit/` with fixtures in `tests/fixtures/`. Jest uses jsdom environment with `@/` path alias mapped to `src/`. The suite expects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to be set (placeholders are enough; CI sets placeholders, `.github/workflows/tests.yml`).

**Test infrastructure** (Phase 0e, `docs/testing/test-infrastructure.tdd.md`):
- **Read seams**: `tests/fixtures/fake-supabase-tables.ts` caps every response at 1000 rows like PostgREST `max-rows` and applies filter → order → range → cap. A reader that forgets to page fails against it; a hand-rolled mock without the cap does not. Use it instead of a new ad-hoc builder mock.
- **Random orders**: `tests/fixtures/report-orders.ts` (`reportOrdersArb`, `toPlatformTables`) generates untidy `ReportOrder`s in whole centavos and projects them onto platform rows, so engine and reader tests share one source.
- **Properties**: any `fc.assert` lives in a `*.property.test.ts` file and takes `propertyParameters()` (`tests/utils/property.ts`); a failure prints a seed and path, replay with `FC_SEED` + `FC_PATH`. Test-enforced (`tests/unit/property-test-conventions.test.ts`).
- **SQL**: new PGlite runners build on `tests/sql/lib/platform-auth.cjs` (roles, `auth.uid()`, Supabase default grants), copy live helper bodies verbatim, run the REAL migration file and assert affected rows per role.

**Verification on every change** (adapted from pstack; the skills live in `~/.claude/skills/`). Green Jest is not the finish line, so these run each time, not on request:
- **`prove-it-works` before saying "done"**: state the finish condition up front, then check the real thing. UI → walk the changed flow at `<tenant>.localhost:3000` (`verify-webnegosyo` on sample-demo, or Chrome MCP) and screenshot it; DB/RLS/trigger → `execute_sql` on platform as the real role, asserting affected rows; server logic → the unit test plus the matching `tests/live/*` suite when one exists; merchant app → simulator. The reply carries commands + output; anything not run is reported as **inconclusive**, never as passed.
- **`blast-radius` before committing** anything that touches auth/RLS/policies, triggers, migrations, money (`src/lib/reports/`, discounts, totals), checkout, staff permissions, or logic mirrored across web/app/Convex/edge functions. Prove the one fact the change is safe because of by running real code; otherwise mark it **unproven**.
- **`benchmark-checklist` for every performance number** (reports speed, query or page timings) before it is reported or acted on. Live probes take `set local statement_timeout = '5s'` and a one-day window first.
- **`verify-webnegosyo`** (`.claude/skills/verify-webnegosyo/`): it may only touch a designated test store, never seed the shared platform DB with fixed slugs, and runs Launch → Doctor → Drive → Evidence → Cleanup. Keep it current with `maintain-verification-skill`.

## Architecture

### Multi-Tenancy

The entire app is multi-tenant. Tenant resolution happens in `src/middleware.ts` using `src/lib/tenant.ts`:
- **Priority**: Custom domain > Subdomain > Path-based routing
- Subdomains use `PLATFORM_ROOT_DOMAIN` env var. Local dev uses `<tenant>.localhost`.
- Reserved subdomains: `www`, `superadmin`, `app`, `admin`
- Custom domains resolve through `src/lib/tenant-domains.ts`: ONE query loads every active custom domain into a per-runtime directory (5 min TTL, stale-on-error, 10s retry back-off). Subdomains are pure parsing (`src/lib/tenant-host.ts`) — the middleware never validates a slug; the storefront's cached tenant read renders "not found".
- Connecting a custom domain is self-serve (owner or superadmin, Settings → Custom domain): `src/lib/domains/`. A claim sits in `tenants.pending_domain` (NEVER routed) until the owner publishes the claim token as TXT `_webnegosyo.<domain>` AND Vercel verifies it — only then does it move into `tenants.domain`. DNS pointing at the shared Vercel project proves the platform, not the store; never route on it alone. No cron (card-driven checks; unproven claims >7 days are released lazily). `pending_domain*`/`domain_verified_at` are privileged columns. Needs `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID`).
- Middleware rewrites subdomain/custom domain requests to path-based routes (`/[tenant]/...`) and gates `/admin` on the SERVED path (the rewrite target). Route classification lives in `src/lib/middleware/routes.ts`.
- Every Supabase client used on a request path has a bounded fetch (`src/lib/supabase/timed-fetch.ts`). Admin layouts (`superadmin`, `[tenant]/admin`) are `force-dynamic` so a build never renders against the live database.

### Route Structure

- `src/app/[tenant]/menu/` — Customer menu (SSR + ISR)
- `src/app/[tenant]/menu/item/[itemId]/` — Product detail page
- `src/app/[tenant]/cart/`, `checkout/` — Shopping cart flow
- `src/app/[tenant]/admin/` — Tenant admin dashboard (protected)
- `src/app/[tenant]/login/` — Tenant admin login
- `src/app/superadmin/` — Platform admin (protected, requires `superadmin` role)
- `src/app/[tenant]/admin/menu-engineering/` — Menu engineering dashboard (BCG matrix, upsell pairs, checkout upsell settings)
- `src/app/api/` — API routes (webhooks, messenger, facebook OAuth, AI parsing)

### Authentication & Authorization

Uses Supabase Auth with `@supabase/ssr` (NOT the deprecated `auth-helpers-nextjs`). Three roles: `superadmin`, `admin` (tenant), `customer` (public).

**Critical**: Supabase client cookies must use ONLY `getAll`/`setAll` pattern. Never use individual `get`/`set`/`remove` cookie methods — they are deprecated and will break session handling.

**New routes and server actions are declared, not hand-checked.** Use `defineRoute` / `defineAction` (`src/platform/http/`): the declaration states who may call it (`auth.kind`, the permission key, the branch rule), the rate limit and the zod input, and the store comes from the caller's own account, never from the request. `tests/unit/guardrails/entry-points.test.ts` fails a new route or action file that checks access by hand (existing ones are on a list that may only shrink); `docs/generated/entry-points.md` is the generated table of who may call what. Reads past 1,000 rows use `readAllRows`, and a write that row-level security can refuse silently goes through `assertRowsChanged` (`src/platform/db/`).

**Ratchets** (`tests/unit/guardrails/ratchets.test.ts`): counts of known debt (loose files in `src/lib`, files over 800 lines, service-role client importers, direct `convex_deployment_url` reads, hand-written DB type imports, UTC dates used as business days) may only go down. When a change lowers one, lower its ceiling in `ratchets.json` in the same change.

Supabase client factories:
- `src/lib/supabase/server.ts` — Server Components/Actions (async, uses `cookies()`)
- `src/lib/supabase/client.ts` — Browser client (synchronous)
- `src/lib/supabase/admin.ts` — Service role client (bypasses RLS)

### Data Layer

- **Database**: Supabase PostgreSQL with Row-Level Security (RLS). Every table has `tenant_id`.
- **Types**: `src/types/database.ts` — Full DB type definitions used with `createClient<Database>()`
- **Migrations**: `supabase/migrations/`. Whether each file is live, held or pending is recorded in `supabase/migration-status.json` (`npm run db:status`); a new migration is added there in the same change, as `applied` only after it is applied AND probed.
- **Queries**: `src/lib/queries/` for reusable data fetching

### Feature rules: read the nested file before you change a feature

Each feature keeps its rules in a `CLAUDE.md` beside its code. Claude Code loads that file when it works in that folder; when a change starts somewhere else (a page, a route, a test), **open the file listed here first**. A new feature's rules go in a `CLAUDE.md` in its own folder plus one row here, never in this file (`tests/unit/guardrails/claude-md.test.ts` keeps this file small and the table complete).

| Feature | Rules | Covers |
|---|---|---|
| Bills: combine and split | `webnegosyo-app/lib/bill/CLAUDE.md` | bill engine, `settleBill`, receipts for bills |
| Boost Sales | `src/lib/boost/CLAUDE.md` | combos, upgrades, pairings, cart last call, Boost AI |
| Convex backend (per-store, legacy) | `convex-template/CLAUDE.md` | template schema, orders, analytics, Lalamove, cron |
| Customer app (older, per-store builds) | `mobile/CLAUDE.md` | white-labeled customer app |
| Delivery address and rider notes | `src/lib/delivery/CLAUDE.md` | address search, pin step, rider remarks, pin links |
| Hero Builder | `src/lib/hero-builder/CLAUDE.md` | v5 flow designs, scoped CSS, custom code blocks |
| Inventory ledger and frozen costs | `src/lib/inventory/CLAUDE.md` | stock movements, `current_qty`, recipes, costs, `order_item_costs` |
| Loyalty wallet passes | `src/lib/loyalty/wallet-pass/CLAUDE.md` | Apple / Google Wallet cards, pass sync |
| Merchant admin app | `webnegosyo-app/CLAUDE.md` | Expo app shared by all merchants, Reports tab, receipt payment lines |
| Merchant notifications (the app's bell) | `webnegosyo-app/lib/merchant-notifications/CLAUDE.md` | `merchant_notifications`, push wording parity, unread rule |
| Order status and loyalty card look | `src/lib/tracking-style/CLAUDE.md` | `tracking_style`, `--trk-*` variables, Studio preview |
| Owl mascot | `src/components/mascot/CLAUDE.md` | generated SVG art, states, where it may appear |
| Owner AI assistant (Owl chat) | `src/lib/assistant/CLAUDE.md` | tools, two-phase proposals, refs, voice input, the app panel |
| Page Designer | `src/lib/page-designer/CLAUDE.md` | checkout / thank-you / tracking designs, blocks, knobs, parts, templates |
| Per-item and per-unit discounts | `src/lib/vouchers/CLAUDE.md` | voucher engine, unit picks, discount lines |
| POS checkout questions and delivery | `webnegosyo-app/components/pos/CLAUDE.md` | register questions, delivery sheet, fee quote |
| Sales numbers and sales reports | `src/lib/reports/CLAUDE.md` | net sales, discounts, payment buckets, `report_*` SQL twins, `/admin/reports` |
| Senior/PWD sales book | `src/lib/gov-discount-ledger/CLAUDE.md` | route guards, PINs, ledger, online claims |
| SMS automations | `src/lib/sms-automations/CLAUDE.md` | recipes, planner, `sms_outbox`, at-most-once delivery, reward codes |
| Store onboarding | `src/lib/onboarding/CLAUDE.md` | set-up link, wizard, build, launch hero, Start here, funnel |
| Tenant branding, card templates and page layouts | `src/components/customer/card-templates/CLAUDE.md` | colour fields, card templates, `card_*` knobs, layouts |
| Welcome Builder | `src/lib/welcome-builder/CLAUDE.md` | welcome page designs, welcome-only blocks, guaranteed entry |

### Staff permission keys: reports, inventory, costs

- Four registry copies must change together: web `src/lib/staff-permissions.ts` (source of truth), app `webnegosyo-app/lib/staff-permissions.ts`, desktop, and `supabase/functions/manage-staff/staff-core.ts` (redeploy). The SQL twin is `public.app_user_has_permission` (IMPLIED_BY included). Parity and migration tests pin all of them.
- `reports` = sales figures (implied by `analytics`; `orders` does NOT grant it). `inventory` = stock, deliveries, waste, counts, transfers, reorder levels. `costs` = unit cost, dish cost, COGS, margins, food cost %, ₱ stock value. `menu` keeps recipes, units and the ingredient master. A screen showing money checks the money key, not the page key.
- **An admin section missing from `ADMIN_SECTION_PERMISSIONS` is open to every staff account.** New sections are mapped or listed in `OPEN_ADMIN_SECTIONS`; the guardrail test walks `src/app/[tenant]/admin` and fails otherwise.
- Order reads (HIGH-3): `ORDER_READ_KEYS` / `PAYMENT_READ_KEYS` mirror the orders/payments SELECT policies. A screen open to all staff (app Home) must not read orders without one of them.
- `permissions: null` (legacy full access) holds every non-opt-in key; editors open such accounts with everything ticked (`editablePermissions`). Production validates lists against its own registry and rejects unknown keys, so a key backfill ships WITH the code that knows the key. Evidence + deploy runbook: `docs/testing/permission-keys.tdd.md`.

### State Management

- **Server state**: TanStack React Query (5 min stale, 10 min GC)
- **Cart**: React Context (`src/hooks/useCart.tsx`) with localStorage persistence and debounced Messenger sync
- **Client state**: Zustand available but Context preferred for cart

### Variation System (Backward Compatible)

Menu items support two variation formats:
- **Legacy**: Flat `Variation[]` (e.g., small/medium/large)
- **New**: Grouped `VariationType[]` with `VariationOption[]` (e.g., Size group + Spice Level group)

Cart utilities in `src/lib/cart-utils.ts` handle both formats.

### Real-Time Orders (Web Admin)

- `src/hooks/use-realtime-orders.ts` — Supabase Realtime subscription for `orders` table (INSERT + UPDATE)
- `src/components/admin/realtime-orders-wrapper.tsx` — Plays chime, fires browser notification, shows toast on new orders. Green pulse dot indicates live connection.
- `src/lib/notification-utils.ts` — Web Audio API two-tone chime, browser Notification API with `requireInteraction: true`
- Orders page (`admin/orders/page.tsx`) routes to `ConvexOrdersWrapper` if Convex is configured, otherwise `RealtimeOrdersWrapper`

### Analytics

Two-path architecture with graceful degradation:
- **Server-side**: `src/app/actions/analytics.ts` dynamically creates a Convex client per-tenant and fires `analytics:trackEvent`
- **Client-side**: `src/hooks/use-analytics.ts` buffers events in a ref array, flushes to Convex every 5 seconds
- **Provider**: `src/components/customer/analytics-provider.tsx` wraps Convex; no-ops if `convex_deployment_url` is null
- **Platform analytics**: `src/lib/queries/platform-analytics-server.ts` + `tenant-metrics-server.ts` query Supabase directly for the superadmin dashboard

### Key Integrations

- **Facebook Messenger**: Webhook at `/api/webhook`, OAuth at `/api/auth/facebook/`, sends orders/carts via `/api/messenger/`
- **Cloudinary**: Image uploads (`src/lib/cloudinary-utils.ts`)
- **Maps (Apple MapKit JS / Mapbox)**: every address field renders `AddressAutocomplete` (`src/components/shared/address-autocomplete.tsx`), which picks the provider from `NEXT_PUBLIC_MAPS_PROVIDER` (`apple` → MapKit JS, else Mapbox; `src/lib/maps/provider.ts`). Apple: browsers get 30-min origin-bound tokens from `GET /api/maps/token` (ES256, signed server-side from `APPLE_MAPKIT_TEAM_ID/KEY_ID/PRIVATE_KEY`); server geocoding uses the Maps Server API (`src/lib/maps/apple/maps-server-api.ts`). No Apple key on a deploy → the field falls back to Mapbox. Customer-facing "directions" links still open Google Maps (Apple Maps on the web doesn't cover Android browsers).
- **Lalamove**: Delivery service via `@lalamove/lalamove-js` SDK (`src/lib/lalamove-service.ts`). Quotation, booking, tracking, cancellation. Markets: PH, SG, HK, TH, TW, MY, VN.
- **Upstash Redis**: Caching for webhooks (`src/lib/redis-cache.ts`)
- **Sentry**: Error tracking and session replay. Server + edge + client instrumentation (`src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx`)
- **AI Menu Parsing**: `POST /api/ai/parse-menu` — superadmin endpoint that sends raw menu text to OpenRouter (Llama 3.3 70B Instruct) for structured extraction of categories, items, variations, and addons
- **Expo Push**: Mobile push notifications via `exp.host/--/api/v2/push/send` — from Convex for Convex tenants, from `POST /api/push/notify-order` (an `orders` trigger via pg_net) for platform-backend tenants. Expo answers HTTP 200 while refusing devices, so both paths read the **tickets** and then the **receipts** (`src/lib/push/expo-delivery.ts`); `MismatchSenderId` appears only in a receipt and means the APK's Firebase project and the FCM V1 key on EAS disagree — `webnegosyo-app/scripts/check-fcm-credentials.mjs` fails an Android build on exactly that.

### Component Organization

- `src/components/ui/` — Shadcn/ui primitives (Radix-based)
- `src/components/customer/` — Customer-facing (product cards, cart, checkout)
- `src/components/admin/` — Tenant admin (menu mgmt, orders, settings)
- `src/components/superadmin/` — Platform admin
- `src/components/shared/` — Cross-cutting (navigation, forms, modals)

### Feature Flags

Feature flags are per-tenant boolean columns on the `tenants` table, controlled by superadmin:
- `menu_engineering_enabled` — Boost Sales master switch (upgrades, pairings, cart last call); merchants flip it themselves from Boost Sales
- `checkout_upsell_enabled` — the cart's inline "last call" row (requires `menu_engineering_enabled`)
- `bundles_enabled` — combos (menu cards + item-page combo option); switched with Boost Sales
- `mapbox_enabled` — Address autocomplete
- `lalamove_enabled` — Delivery integration
- `enable_order_management` — Admin order management features
- `app_enabled` — Mobile app availability

## Code Conventions

- TypeScript strict mode. Prefer interfaces over types. Avoid enums (use maps).
- Functional/declarative patterns. No classes.
- Named exports for components. Lowercase-with-dashes for directories.
- Descriptive variable names with auxiliary verbs (`isLoading`, `hasError`).
- Minimize `'use client'`, `useEffect`, `setState` — favor Server Components.
- Wrap client components in Suspense with fallback.
- Use `@/` path alias for all imports from `src/`.
- Validate with Zod schemas. Forms use React Hook Form + `@hookform/resolvers`.
- Styling: Tailwind CSS 4, mobile-first. Use Shadcn UI and Radix primitives.
- Run `npm run lint` before considering a task complete (Vercel deployment will fail on lint errors).

### Logging

Request-path logging goes through `src/lib/logger.ts` (`createLogger(label, flagKey)`) — edge-safe, no dependencies. Do not re-implement the gate inline.

- `log.debug(...)` is **opt-in per namespace** and silent by default, including in development. Middleware re-runs on RSC prefetches and client-side navigations, so unconditional dev tracing prints the same lines many times per page view and buries real errors.
- `log.error(...)` is **never gated** — middleware catch blocks must stay visible in Vercel logs.

Turn tracing on with an env var: `DEBUG_TENANT_RESOLUTION=true` (tenant resolver), `DEBUG_MIDDLEWARE=true` (middleware rewrites), `DEBUG_MESSENGER=true` (webhook + Graph API; lines carry PSIDs), `DEBUG_LALAMOVE=true`, or `DEBUG_ALL=true` for every namespace. Only the exact string `true` counts. Add new namespaces to `DebugFlagKey` and `readDebugFlags()` in the same file.
