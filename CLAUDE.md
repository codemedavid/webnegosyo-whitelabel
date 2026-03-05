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
- In-memory caches (5 min TTL, max 1000 entries) for domain lookups and tenant existence checks
- Middleware rewrites subdomain/custom domain requests to path-based routes (`/[tenant]/...`)

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

### Menu Engineering & Upsell System

Menu engineering is a feature-flagged system (`menu_engineering_enabled` + `checkout_upsell_enabled`) that enables BCG matrix classification, upsell pairs, bundles, and checkout interstitials.

**BCG Matrix Classification** (`src/lib/menu-engineering-service.ts`):
- Each `MenuItem` has a `bcg_classification`: `star | plowhorse | puzzle | dog | unclassified`
- Admin dashboard at `/[tenant]/admin/menu-engineering` with 2x2 quadrant visual, bulk classify, and per-item dropdowns
- `badge_text` field renders as an overlay pill on card templates when `menuEngineeringEnabled` is true

**Upsell Pairs** (`upsell_pairs` table):
- Two pair types: `complementary` (post-add-to-cart suggestion) and `upgrade` (pre-add side-by-side comparison)
- Extra columns: `is_auto_generated`, `bcg_strategy`, `upgrade_display_style` (`inline` | `modal`), `max_suggestions`
- `UpsellSuggestionModal` — shown after adding an item, displays complementary items
- `UpgradeUpsellModal` — shown before adding, side-by-side comparison with animated arrow

**Phase 1 — "Make it a Meal?" Upgrade** (`src/components/customer/inline-upgrade-section.tsx`):
- McDonald's kiosk-style full-width section on product detail page with side-by-side cards
- "Ala Carte" (current item) vs "Meal" (upgrade/bundle) — large 4:3 images, bold labels, price diff badges
- Default selects "Ala Carte"; tapping upgrade switches with green border + checkmark animation
- Supports custom labels via `upgrade_header`, `source_label`, `target_label` on upsell pairs
- Smart suggestions via `getSmartUpgradeSuggestions` / `getSmartUpgradeSuggestionsRanked` (AOV lift scoring)
- Admin: `SmartUpgradePanel` in upsell pairs tab, live preview of customer-facing cards
- Analytics: `upsell_shown` + `upsell_clicked` with `source: 'inline_upgrade'`
- Gated by `menuEngineeringEnabled`

**Phase 2 — "Perfect with..." Pair Suggestion** (`src/components/customer/pair-suggestion-sheet.tsx`):
- Full-screen takeover page triggered after "Add to Cart" for complementary pair suggestions
- Bold header: "Perfect with [item name]", subtitle: "Complete your order"
- Responsive grid: 2 cols mobile, 3 tablet, 4 desktop — large cards with 4:3 images and "Add" buttons
- Green "Added!" state with checkmark overlay on added items
- "Continue" button navigates back to menu; "Buy Now" flow redirects to cart after prompts
- Analytics: `upsell_shown`, `upsell_clicked`, `upsell_dismissed` with `source: 'pair_suggestion'`
- BCG-powered auto-generation: `generateSmartPairSuggestions` pairs plowhorses→stars, stars→stars, puzzles→plowhorses
- Admin: `SmartPairSuggestionsTab` with Generate/Accept/Reject/Bulk Accept, images, prices, AOV lift estimates

**Phase 3 — "Before you go..." Checkout Page** (`src/components/customer/checkout-upsell-modal.tsx`):
- Full-screen takeover on ALL devices (not a modal/drawer) triggered from cart "Checkout" button
- 4-tier priority waterfall: manually-flagged items → complementary pairs → BCG star items → any available items
- Running cart total display, responsive grid (2/3/4 cols), large cards with "Add to Cart" buttons
- "No thanks, checkout" ghost button as secondary action
- Analytics: `upsell_shown`, `upsell_clicked`, `upsell_dismissed` with `source: 'checkout_modal'`
- Customizable branding via 7 `checkout_modal_*` tenant color fields
- Cart page prefetches suggestions on load for instant display
- Admin settings: `CheckoutUpsellSettingsTab` in menu engineering dashboard (enable/disable, title, subtitle, max items, item picker)

**Bundles** (`src/lib/bundles-service.ts`, `src/components/customer/bundles-section.tsx`):
- `bundles` + `bundle_items` tables. Pricing types: `fixed` or `discount` (percentage off)
- `BundlesSection` renders above menu categories with savings badges and 2x2 thumbnail grids
- `BundleCustomizationModal` — per-item variation/addon selection before adding bundle to cart
- `BundleUpsellModal` — suggests a bundle when adding a single item that belongs to one
- `show_on_menu` and `show_as_upsell` are independent toggles per bundle
- Gated by `bundles_enabled` per-tenant flag

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
- **AI Menu Parsing**: `POST /api/ai/parse-menu` — superadmin endpoint that sends raw menu text to NVIDIA API for structured extraction of categories, items, variations, and addons
- **Expo Push**: Mobile push notifications via `exp.host/--/api/v2/push/send` (triggered from Convex on new orders)

### Component Organization

- `src/components/ui/` — Shadcn/ui primitives (Radix-based)
- `src/components/customer/` — Customer-facing (product cards, cart, checkout)
- `src/components/admin/` — Tenant admin (menu mgmt, orders, settings)
- `src/components/superadmin/` — Platform admin
- `src/components/shared/` — Cross-cutting (navigation, forms, modals)

### Tenant Branding

Tenants have 40+ customizable color fields applied via CSS variables (`src/lib/branding-utils.ts`). Card templates: classic, minimal, modern, elegant, compact, bold, glass, polaroid, brutalist, magazine, zen, neon.

### Feature Flags

Feature flags are per-tenant boolean columns on the `tenants` table, controlled by superadmin:
- `menu_engineering_enabled` — Master toggle for BCG classification, badges, and upsell pairs
- `checkout_upsell_enabled` — Secondary toggle for checkout interstitial (requires `menu_engineering_enabled`)
- `bundles_enabled` — Bundle system (menu bundles + bundle upsell)
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
