# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant restaurant ordering SaaS platform ("WebNegosyo"). Merchants create white-labeled online menus; customers order via the web and orders are sent to the merchant's Facebook Messenger. Built with Next.js 15 App Router, Supabase, Convex, and TypeScript. The platform includes a Next.js web app, a white-labeled customer mobile app, and a merchant admin mobile app.

## Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build (runs validate-env.mjs prebuild)
npm run lint             # ESLint
npm run test             # Jest unit tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Coverage report
npm run test -- --testPathPattern="cart-utils"  # Run a single test file
```

Tests live in `tests/unit/` with fixtures in `tests/fixtures/`. Jest uses jsdom environment with `@/` path alias mapped to `src/`.

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

Supabase client factories:
- `src/lib/supabase/server.ts` — Server Components/Actions (async, uses `cookies()`)
- `src/lib/supabase/client.ts` — Browser client (synchronous)
- `src/lib/supabase/admin.ts` — Service role client (bypasses RLS)

### Data Layer

- **Database**: Supabase PostgreSQL with Row-Level Security (RLS). Every table has `tenant_id`.
- **Types**: `src/types/database.ts` — Full DB type definitions used with `createClient<Database>()`
- **Migrations**: `supabase/migrations/` (28 SQL files)
- **Queries**: `src/lib/queries/` for reusable data fetching

### State Management

- **Server state**: TanStack React Query (5 min stale, 10 min GC)
- **Cart**: React Context (`src/hooks/useCart.tsx`) with localStorage persistence and debounced Messenger sync
- **Client state**: Zustand available but Context preferred for cart

### Variation System (Backward Compatible)

Menu items support two variation formats:
- **Legacy**: Flat `Variation[]` (e.g., small/medium/large)
- **New**: Grouped `VariationType[]` with `VariationOption[]` (e.g., Size group + Spice Level group)

Cart utilities in `src/lib/cart-utils.ts` handle both formats.

### Boost Sales (combos, upgrades, pairings, cart last call)

One merchant screen, `/[tenant]/admin/boost-sales` (sidebar: Menu → Boost Sales, never hidden), organised by the four moments a diner meets an offer. Every offer lives at exactly one moment:

| Moment | Offer | Stored in | Diner UI |
|---|---|---|---|
| On the menu | Combo | `bundles` + `bundle_slots` (+ `bundle_slot_price_overrides` = per-choice surcharges) | combo card via `bundle-adapter.ts` |
| On the item page | Upgrade (+ combos containing the item) | `upsell_pairs` `pair_type='upgrade'` | inline `ItemOffers` — never a takeover |
| Right after adding | Pairing | `upsell_pairs` `pair_type='complementary'`, one row per source × target | `AddedSheet` bottom sheet |
| In the cart | Last call | `tenants.checkout_upsell_*` + `menu_items.show_in_checkout_upsell` (picks; none = automatic) | inline `CartOffersSection` — checkout is never gated |

- **Engine** (`src/lib/boost/`, pure + tested in `tests/unit/boost/`): `menu-roles` (main/side/drink/dessert from category + item names, EN + Filipino), `basket-stats` (co-occurrence from real orders), `ideas` ("Ready to go" drafts; anchors on mains, or on drinks for cafés), `combo-draft` (editor "picks" ⇄ bundle slots), `pairing-groups` (rows ⇄ offers), `pricing` (charm prices, savings).
- **Server**: `workspace.ts` loads everything (order history only for `resolveOrderBackend === 'platform'`, paged past the 1000-row API cap); `writes.ts` + `src/app/actions/boost.ts` do every write and refresh Redis + storefront caches together. Client combo lines carry slot provenance and proposed surcharges; checkout verifies complete tenant-owned combos and allocates their authoritative total across dish lines. Boost performance reports combo orders; allocated dish revenue is not presented as a separate combo revenue metric.
- **Merchant UI** `src/components/admin/boost/`: journey rail, ideas (one tap + Undo), sections, and ONE editor sheet (`EditorShell`) with live previews that render the real diner components from `src/components/customer/offers/`.
- **Self-serve**: `setBoostEnabledAction` flips `menu_engineering_enabled` + `bundles_enabled` via the service role (the tenant-column guard trigger blocks the `authenticated` role). Without the flag the page is the welcome screen.
- **Theming**: diner offers never hard-code colours — `offer-theme.ts` (modal colours; the cart row uses `checkout_modal_*`).
- Analytics sources kept for report continuity: `inline_upgrade` (item page), `post_add` (after adding), `checkout_modal` (cart row).
- `/admin/bundles/new` and `/admin/bundles/[id]` redirect into the Boost Sales editor (`?new=combo`, `?edit=combo:<id>`). Pairing rules (`pairing_rules_enabled`) still feed the after-add moment as a fallback but have no admin UI.
- **AI generations** (`src/lib/boost/ai/`, `src/app/actions/boost-ai.ts`): `FREE_BOOST_AI_GENERATIONS` (3, lifetime per store) runs via OpenRouter (`src/lib/ai/openrouter.ts`, same models as the menu parser). The model sees short item refs (`i12`), never UUIDs; `proposals.ts` drops anything that fails validation. Runs + proposals live in `boost_ai_generations` / `boost_ai_proposals` — service-role writes only (the log IS the quota); `claim_boost_ai_generation` reserves a slot atomically and failed runs don't count. Proposals go pending → approved → applied (never live without approval); apply reads the payload from the DB and goes through the same `ideaToWrite` mapping as one-tap ideas.
- **Picked together** (`pair-insights.ts` share/support/lift, `order-baskets.ts` reads baskets from the store's real backend — platform, tenant Supabase or Convex `orders:getAllOrderItemsInternal`, Redis-cached 10 min) renders on Boost Sales and Product Analytics.

### Loyalty wallet passes (Apple Wallet / Google Wallet)

A loyalty member can add their stamp card to Apple or Google Wallet from the order-tracking page (`AddToWalletButtons` inside `LoyaltyStampCard`); the POS attaches a guest by scanning it (`CustomerPickerSheet` → `MemberCardScanner`).

- **Engine** `src/lib/loyalty/wallet-pass/` (pure parts tested in `tests/unit/loyalty/wallet-pass/`): `content` renders ONE platform-neutral card (both wallets draw from it; its sha256 decides whether anything is pushed), `apple-pass-json` / `google-objects` format it, `apple-ws-route` + `apple-ws-handler` implement Apple's PassKit web service, `sync-plan` decides who hears about a change.
- **Identity**: a pass carries only a random 144-bit serial (QR `WNLC1.<serial>`), never the phone. Passes are issued ONLY for a receipt proven by its tracking token, for the number already on that order (`resolveOrderLoyaltyMember`, shared with the stamp card) — never for a typed number. Apple's per-pass token is HMAC-derived (`WALLET_PASS_AUTH_SECRET`), not stored.
- **Keeping cards current**: pg_net triggers on `loyalty_balances` / `loyalty_entitlements` / `loyalty_programs` post an id to `/api/loyalty/passes/sync` (ids only, everything re-read; gated by `X-Wallet-Sync-Secret` = Vault `wallet_pass_sync_secret` = env `WALLET_PASS_SYNC_SECRET`). Apple = APNs empty push with the pass certificate, device then pulls; Google = PATCH the object. Per-wallet watermarks (`apple_pushed_hash`, `google_synced_hash`); Google is only called for members who asked for a Google pass.
- **Routes**: `GET /api/loyalty/passes/{apple,google}` (issue), `/api/loyalty/passes/apple-ws/v1/...` (device web service), `POST /api/loyalty/passes/sync`, `POST /api/loyalty/passes/identify` (bearer, same tenant + `pos`).
- **Config** (`config.ts`) fails closed per wallet; see ENV_VARIABLES_NEEDED.txt. Swap the text buttons for Apple's/Google's official badge artwork before launch.

### Convex (Real-Time Backend)

Convex serves as a secondary real-time backend alongside Supabase. Each tenant optionally has a `convex_deployment_url`.

- **Template**: `convex-template/convex/` — deployable per-tenant Convex backend
- **Schema**: `orders`, `orderItems`, `analyticsEvents`, `dailyStats`, `tenantConfig`, `pushTokens`
- **Orders**: Real-time order queue (`getRealtimeQueue`), dashboard stats, status management. Web admin falls back to Supabase Realtime if no Convex URL is set.
- **Analytics**: `trackEvent` mutation, `getUpsellAnalytics`, `getBundleAnalytics`, `getTopItems`, `getTrends` queries
- **Notifications**: `sendOrderNotification` pushes to Expo Push API on new orders
- **Lalamove**: `bookLalamove` action calls Lalamove v3 REST API directly from Convex
- **Cron**: Daily stats aggregation at 23:59 UTC via `statsAggregator.aggregateToday`
- **Web wrapper**: `src/components/admin/convex-orders-wrapper.tsx` wraps `ConvexProvider` per tenant
- **Client hook**: `src/hooks/use-analytics.ts` buffers events and flushes to Convex every 5 seconds
- **Graceful degradation**: If `convex_deployment_url` is null, analytics and Convex features no-op silently

### Real-Time Orders (Web Admin)

- `src/hooks/use-realtime-orders.ts` — Supabase Realtime subscription for `orders` table (INSERT + UPDATE)
- `src/components/admin/realtime-orders-wrapper.tsx` — Plays chime, fires browser notification, shows toast on new orders. Green pulse dot indicates live connection.
- `src/lib/notification-utils.ts` — Web Audio API two-tone chime, browser Notification API with `requireInteraction: true`
- Orders page (`admin/orders/page.tsx`) routes to `ConvexOrdersWrapper` if Convex is configured, otherwise `RealtimeOrdersWrapper`

### Mobile Apps

**Customer App** (`mobile/`):
- Expo SDK 54 / React Native 0.81.5 with Expo Router (Stack navigation)
- White-labeled per tenant — each merchant gets their own branded build (name, icon, splash, colors)
- Screens: home, menu (category sidebar + grid), item detail, cart, checkout, order confirmation, order status
- State: Zustand stores (cart, order, app, customer history) + React Query for server data
- Theme: `theme/provider.tsx` applies tenant branding via ported `src/lib/branding-utils.ts`
- Build: `scripts/build-tenant.ts` fetches tenant → generates icons via Sharp → EAS Build
- CI: `.github/workflows/build-tenant.yml` (workflow_dispatch)

**Merchant Admin App** (`webnegosyo-app/`):
- Expo SDK 54 / React Native with Expo Router (Tab navigation)
- Single app (`com.webnegosyo.admin`) shared by all merchants, tenant resolved via Supabase `app_users` lookup after login
- Screens: dashboard (live order queue + daily stats), orders list, order detail, analytics (upsell/bundle), trends (revenue charts)
- Uses Convex for real-time order data, Supabase for auth
- Push notifications via `expo-notifications` + custom ringtone sound on new orders
- `useOrderAlerts` hook for in-app new order alerts

### Analytics

Two-path architecture with graceful degradation:
- **Server-side**: `src/app/actions/analytics.ts` dynamically creates a Convex client per-tenant and fires `analytics:trackEvent`
- **Client-side**: `src/hooks/use-analytics.ts` buffers events in a ref array, flushes to Convex every 5 seconds
- **Provider**: `src/components/customer/analytics-provider.tsx` wraps Convex; no-ops if `convex_deployment_url` is null
- **Platform analytics**: `src/lib/queries/analytics-server.ts` queries Supabase directly for superadmin dashboard (`getTopActiveTenants`, `getTotalOrders`)

### Key Integrations

- **Facebook Messenger**: Webhook at `/api/webhook`, OAuth at `/api/auth/facebook/`, sends orders/carts via `/api/messenger/`
- **Cloudinary**: Image uploads (`src/lib/cloudinary-utils.ts`)
- **Mapbox**: Address autocomplete and geocoding
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

### Tenant Branding

Tenants have 40+ customizable color fields applied via CSS variables (`src/lib/branding-utils.ts`). Card templates: classic, minimal, modern, elegant, bold, glass, polaroid, brutalist, magazine, zen, neon, storefront (fixed designs), plus the **flexible** set — showcase, atelier, kiosk, sticker, menuboard, arch, bistro — built on `card-templates/flex/card-kit.tsx` and tuned by six `card_*` knob columns (`src/lib/card-style.ts`; NULL/`auto` = template default, per-device via `mobile_overrides`). A new flexible design is flagged `isFlexible` in `CARD_TEMPLATES` and composes the kit. Page layouts add storefront, kiosk, rails, lookbook — scroll-based catalogs sharing `layouts/layout-parts.tsx` + `useCategoryScrollSpy`. The Studio pickers and the SmartMenu MCP (`get_branding` `designCatalog`, `src/lib/mcp/design-catalog.ts`) derive from `CARD_TEMPLATES` / `PAGE_LAYOUTS`, so registering a design there is the only edit. The `compact` card was retired 2026-09-24 (stores moved to `menuboard`).

Dev gotcha: `/_next/static` is served `immutable` even in dev, and dev chunk names don't change, so a browser that already loaded the storefront keeps running stale client code after edits. Load a fresh origin (e.g. `127.0.0.1` instead of `localhost`) when verifying UI changes.

### Hero Builder (custom storefront hero)

`/[tenant]/admin/hero-designer` (sidebar: "Hero Builder", full-screen like Branding Studio) edits a **v5 flow design**: sections → columns → widgets, each node a desktop `style` + optional `tablet`/`mobile` partial overrides (desktop-first cascade, `resolveStyle`). Nothing is absolutely positioned, so a design cannot overflow a phone.

- **Engine** `src/lib/hero-builder/` (pure, tested in `tests/unit/hero-builder/`): `types`, `schema` (save-time zod), `tree-ops` (immutable edits), `editor-state` (reducer + coalesced undo), `css` (design → ONE scoped sheet using `@container hb` queries — the storefront renders the design once; the editor's 1280/820/390px frames show real layouts because breakpoints are container widths), `load` (parse + v4→v5 on the fly), `templates` / `section-presets`.
- **`tenants.hero_design` is a TEXT column** — the API returns a JSON string. Always read it through `loadHeroDesign` / `hero-mode.ts`; `design.version` on the raw value is always undefined (this silently disabled every custom hero before v5).
- A custom hero renders ONLY when `hero_preset === 'custom'`; `publishHeroDesignAction` validates, stores and sets it. v3 (absolute) designs keep the legacy `HeroRenderer`.
- **Every value is re-validated at render** (`safe-values.ts`) because the sheet is injected into `<style>`; table lookups use own-property checks (`constructor`/`__proto__` keys once crashed the sheet build).
- **Custom code**: "HTML & CSS" = DOMPurify (browser-side, at output) into a shadow root with `contain: layout paint` (styles can't leak, `position:fixed` can't escape the box). "Embed" = `srcdoc` iframe sandboxed WITHOUT `allow-same-origin`/`allow-top-navigation`; only height messages from that frame's own window are honoured.

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

Turn tracing on with an env var: `DEBUG_TENANT_RESOLUTION=true` (tenant resolver), `DEBUG_MIDDLEWARE=true` (middleware rewrites), or `DEBUG_ALL=true` for every namespace. Only the exact string `true` counts. Add new namespaces to `DebugFlagKey` and `readDebugFlags()` in the same file.
