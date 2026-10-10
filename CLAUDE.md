# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant restaurant ordering SaaS platform ("WebNegosyo"). Merchants create white-labeled online menus; customers order via the web and orders are sent to the merchant's Facebook Messenger. Built with Next.js 15 App Router, Supabase, Convex, and TypeScript. The platform includes a Next.js web app, a white-labeled customer mobile app, and a merchant admin mobile app.

## Platform Supabase First (READ BEFORE ANY CHANGE)

Most tenants now run on the **shared platform Supabase**: `resolveOrderBackend(tenant) === 'platform'` (`src/lib/order-backend.ts`). Convex and per-tenant Supabase (`supabase`) are the minority/legacy paths, even though older code and comments treat platform as the "legacy default" or a fallback. **A change is not done until it works end-to-end on platform Supabase.**

- **Build the platform path first, then verify it.** Never ship something that only works on Convex, or that quietly no-ops or degrades on platform. If a feature touches orders, analytics, push, inventory, loyalty, delivery or the mobile apps, confirm that a platform branch exists and is actually exercised.
- **Route through `resolveOrderBackend`.** Never work out the backend from credentials yourself: a leftover `convex_deployment_url` on a platform tenant must not send reads or writes to Convex.
- **Merged migrations are not applied migrations.** A migration in `supabase/migrations/` counts only once it is applied to the platform project AND probed: check that the objects (columns, functions, policies, triggers) exist, not just the migration name. Then regenerate `src/types/database.ts` via the Supabase MCP.
- **Test RLS as the role that really runs the query**: anon (storefront/checkout), `authenticated` (admin/staff), service role. RLS refusals are usually silent (zero rows, `null`, a `RETURNING` that comes back empty), so assert affected rows instead of trusting "no error".
- **Respect platform limits**: page past the 1000-row API cap, keep queries indexed and bounded, and use the timed fetch on request paths. Every tenant shares this one database, so a slow query hurts every store.
- **Convex-only features need a platform equivalent.** Examples: Lalamove actions, push notifications, analytics events, cron aggregation. For the apps, read and write the platform DB directly, not through Convex functions.
- **Verify against the real platform database** (Supabase MCP `execute_sql`, logs, advisors), not only Jest mocks, before calling a backend change done.

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

### Owner AI assistant ("Owl")

Floating owl chat in the tenant admin (`src/components/admin/assistant/`, mounted in `admin-layout-client.tsx`, hidden on full-bleed studios and for branch-locked accounts). Model `openai/gpt-6-luna` via OpenRouter (`ASSISTANT_MODEL`), Vercel AI SDK **v6** (v7 is ESM-only and breaks next/jest — keep the exact pins). Per-store `tenants.assistant_enabled` (privileged column, superadmin form toggle).

- **Pattern**: one bounded tool-calling loop (`MAX_STEPS_PER_TURN`) over deterministic tools in `src/lib/assistant/tools/` — NOT RAG. Tools return `{facts, card, chips, links}`: `facts` (small, ids scrubbed) is all the MODEL sees (`toModelOutput`); `card` renders only in the browser. Keep the tool list order and `SYSTEM_PROMPT` static — they are the cached prompt prefix; per-request context goes in `buildContextNote`.
- **Tenant is injected, never a tool input** (`ctx.tenantId` from `resolveAssistantAccess`). Tools are filtered per caller (`availableTools`: staff permission, `ownerOnly`, store feature flags). Branch-locked accounts are refused for now.
- **Refs**: the model sees `i12`/`c3`/`s2`/`g1`/`x4`, never UUIDs, phones or emails (`refs.ts`, persisted per conversation; `maskCustomerName`, `staffLabel`).
- **Writes are two-phase**: `propose_*` tools validate and store a payload in `assistant_actions`; ONLY the owner's Confirm tap (`POST /api/assistant/actions/:id`, no model) executes the STORED payload through the normal cookie-session writers after a CAS `pending → executing` (30-min expiry, proposer-only). Offers reuse Boost AI's `normalizeAiProposals`; SMS is always a draft (the handset sends); vouchers use `validateVoucherDraft`. No delete tools exist.
- **Managing what exists** (2026-10-06): reads `get_orders_now`, `get_live_offers`, `get_loyalty`, `get_sms_campaigns`, `get_vouchers` hand out refs (`o`/`p`/`m`/`v`); proposals `propose_offer_change` (pause/resume/re-price a combo — pairings are addressed by source dishes, `insights/offer-target.ts`), `propose_cart_last_call`, `propose_loyalty_program` (new = DRAFT, edit = new version with `expectedVersion`), `propose_loyalty_status` (active/paused only — ending is permanent and never offered), `propose_pause_sms_campaign` (activation stays on the handset), `propose_voucher_status`, `propose_menu_item_change` (price within 3x / sold out). Executors in `actions/execute-manage.ts`. Loyalty and campaign writes use the service role like their web routes, so `ACTION_PERMISSION` (`loyalty_manage`, `customers`) in the confirm route IS their boundary. A new kind must be added to the `assistant_actions_kind_check` constraint (test-enforced against the migration).
- **Menu photos → dishes** (2026-10-07): a message may carry ≤3 photos (`message.images`, data URLs, `checkMessagePhotos` in `photos.ts`; browsers shrink to 1600px, the app only re-compresses — no resize module in its binary). Photos live for ONE turn in `ctx.photos`; only a `data-photos` count part is stored and the chat model never sees them. `propose_menu_from_photo` runs the existing menu parser (`parseMenuWithAi`, Gemma vision) with its own `timeoutMs`, matches categories/dishes to the store by folded name (`insights/menu-import.ts`) and files ONE `menu_import` proposal (≤40 dishes); the model addresses it by refs (`n` import, `d` dish = `<action id>#<index>`), and `propose_menu_import_edit` re-files a corrected copy and cancels the old card. Confirm (`execute-menu-import.ts`) checks `menu` once, writes through the caller's session client, skips dishes that reached the menu meanwhile, appends to each category.
- **History** is rebuilt server-side (the browser sends only its new message), compacted (`history.ts`), and proposal outcomes are patched back in (`withActionStatuses`).
- **Voice input**: the empty composer shows a mic (web `voice-input.ts` MediaRecorder; app `VoiceRecordingBar` + `use-voice-note.ts`, mono AAC m4a — never expo's LOW_QUALITY preset, which is 3gp/AMR on Android). Both post to `POST /api/assistant/transcribe` (same access + Bearer as chat, own per-person limits) → Whisper via OpenRouter `/audio/transcriptions` (`OPENROUTER_API_KEY`; model `ASSISTANT_TRANSCRIBE_MODEL`, default `openai/whisper-large-v3`; multipart ignores Whisper's `prompt`). The transcript only fills the composer; the owner reviews it and sends. Audio is never stored.
- **Budget**: `claim_assistant_turn` RPC (atomic, fails closed) + `record_assistant_usage`; Upstash burst limit per person. Tables are service-role only (no anon/authenticated grants).
- **Merchant app** (`webnegosyo-app/components/assistant/`, `lib/assistant/`): same floating owl + full-screen panel, mounted in `app/(main)/_layout.tsx`; shown when `assistantEnabled` (session reads `tenants.assistant_enabled`) on store-wide, non-demo accounts, hidden on POS/tender/kitchen/scan and `[param]` editor screens. It calls the SAME three routes with `Authorization: Bearer <access token>`: each route is wrapped in `withRequestBearer` (`src/lib/supabase/bearer-session.ts`), which makes `createClient()` act as that token's user for the whole request (tool calls mid-stream included), so access checks and writers are unchanged. The app parses the UI message stream itself (`ui-stream.ts`, fixture captured from the pinned `ai`) because `@ai-sdk/react`'s React peer range excludes RN's pinned React. Links map web admin paths to app screens (`links.ts`); Boost Sales opens the web. A new tool/link/label must be mirrored in `lib/assistant/presentation.ts` + `links.ts`.
- **Tests**: `tests/unit/assistant/` (incl. a scripted-model route test); live checks are opt-in: `ASSISTANT_LIVE=1 ASSISTANT_LIVE_TENANT=… ASSISTANT_LIVE_USER=…` (`tests/live/assistant-live.test.ts`, real DB, proposes but never confirms) and `ASSISTANT_GOLDEN=1` (`tests/live/assistant-golden.test.ts`, routing accuracy over `tests/fixtures/assistant/golden.json`).

### Loyalty wallet passes (Apple Wallet / Google Wallet)

A loyalty member can add their stamp card to Apple or Google Wallet from the order-tracking page (`AddToWalletButtons` inside `LoyaltyStampCard`); the POS attaches a guest by scanning it (`CustomerPickerSheet` → `MemberCardScanner`).

- **Engine** `src/lib/loyalty/wallet-pass/` (pure parts tested in `tests/unit/loyalty/wallet-pass/`): `content` renders ONE platform-neutral card (both wallets draw from it; its sha256 decides whether anything is pushed), `apple-pass-json` / `google-objects` format it, `apple-ws-route` + `apple-ws-handler` implement Apple's PassKit web service, `sync-plan` decides who hears about a change.
- **Identity**: a pass carries only a random 144-bit serial (QR `WNLC1.<serial>`), never the phone. Passes are issued ONLY for a receipt proven by its tracking token, for the number already on that order (`resolveOrderLoyaltyMember`, shared with the stamp card) — never for a typed number. Apple's per-pass token is HMAC-derived (`WALLET_PASS_AUTH_SECRET`), not stored.
- **Keeping cards current**: pg_net triggers on `loyalty_balances` / `loyalty_entitlements` / `loyalty_programs` post an id to `/api/loyalty/passes/sync` (ids only, everything re-read; gated by `X-Wallet-Sync-Secret` = Vault `wallet_pass_sync_secret` = env `WALLET_PASS_SYNC_SECRET`). Apple = APNs empty push with the pass certificate, device then pulls; Google = PATCH the object. Per-wallet watermarks (`apple_pushed_hash`, `google_synced_hash`); Google is only called for members who asked for a Google pass.
- **Routes**: `GET /api/loyalty/passes/{apple,google}` (issue), `/api/loyalty/passes/apple-ws/v1/...` (device web service), `POST /api/loyalty/passes/sync`, `POST /api/loyalty/passes/identify` (bearer, same tenant + `pos`).
- **Config** (`config.ts`) fails closed per wallet; see ENV_VARIABLES_NEEDED.txt. Swap the text buttons for Apple's/Google's official badge artwork before launch.

### Bills: combine & split (merchant app)

`webnegosyo-app/app/(main)/bill.tsx?orders=<id,id>` — one bill over one or more PLACED orders. Opened from a table ("Bill & split") or an order ("Split or combine bill"); "Combine another order" adds more. Modes: One bill · Split evenly · By item (tap a guest, tap dishes).

- **A bill never moves items between orders** (unlike Toast/Loyverse "merge/split tickets"): kitchen, stock, analytics and each order's own receipt are untouched. Only the paper and the payment spread change. Pure engine in `webnegosyo-app/lib/bill/` (tested in place).
- **Money in centavos** (`money.ts` largest-remainder): by item prices every PIECE (`bill-split.ts` units) with its slice of its order's service/delivery/discount, so an order's units always sum to its total. Even split freezes the owed amount when chosen (`bill-plan.ts` `basisCents`).
- **Paying** = `settleBill`: one `orders:recordPayment` row per order the payment settles (by-item shares fill their own orders first, else oldest first), never more than an order owes; cash/change noted on the first row only; `updatePaymentStatus('paid')` only when square. Stops at the first failed write and reports it. Gate = `canCollectPayment` for every owing order (`bill-state.ts`).
- **Plan** (mode, guests, who-had-what, per-guest paid) is in-memory zustand (`stores/bill-store.ts`), locked once a guest pays; the ledgers stay the truth. By item is refused once money was taken outside the split.
- **Receipts** go through the merchant's layout: `ReceiptOrder.bill` (heading / orderRefs / share) + `amountPaid` (Paid · Balance due · Amount due). Bills print without the tracking QR (`printOrder(order, { printKey, withQr: false })`) and never inherit an order's stored cash/change.

### POS checkout questions & delivery (merchant app)

The register asks the storefront's own checkout questions (`customer_form_fields`, per order type) — all OPTIONAL at the counter.

- **Fields** (`webnegosyo-app/lib/pos-checkout-fields.ts`, resource `use-checkout-setup.ts`, optional offline-pack part): name/phone/table/address (incl. aliases like "Contact Number") map onto the register's existing controls; everything else is a custom question under the tender screen's folded "More details" (`CheckoutDetails`). Answers live in the cart store (`checkoutAnswers`, cleared with every sale) and are written to `customerData` under the field's own name — spread FIRST in `buildPosOrder`, so register keys always win.
- **Delivery sheet** (`components/pos/DeliverySheet.tsx` + `delivery/`): address type-ahead → `POST /api/maps/places` (Apple Maps Server API search, store-pin biased); a pick stores `delivery_lat/lng` (strings, like the web) and shows a static map (`/api/maps/snapshot`, signed Apple snapshot URL — no native map module; drag-pin needs an EAS build) + "Open in Google Maps". Appending to a picked address keeps the pin.
- **Fee**: `/api/maps/delivery-quote` runs the checkout's own ROAD-distance pricing; the app applies the free-delivery minimum and fills the box ("Auto") only when it is empty or still holds a suggestion — a typed fee always wins. Offline → straight line × 1.3, labelled "estimate". Lalamove stores get no suggestion.
- All three routes: bearer member of the store (`gateAppMapsRequest`), per-person burst + daily limits (shared Apple quota).

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
- **Reports tab = customer-first dashboard** (`app/(main)/reports.tsx`, `components/reports/`): revenue split into regulars / first-timers / unnamed, three levers (customers, came back, spend per order), "You know N% of your buyers", one-tap "Bring them back" moves (SMS presets via `newCampaignFromPresetHref`, Rewards), favourites by segment, best customers, then a "Dig deeper" list (`REPORTS_SECTIONS`). Numbers come from `overview.dashboard` on `POST /api/customers/hub-overview` (`src/lib/customer-dashboard.ts`, pure). The split is per ORDER (first ever order = first-timer, later = regular) — a per-customer "before the window" rule read 0% regulars on every store with recent named history. On for every platform store; Convex stores need `customer_hub_enabled` (`isCustomerHubOn`, mirrored in the app session). Guest list + Rewards hang under Reports (`REPORTS_DOORS`); the old `customer-hub` screen is gone.

### Analytics

Two-path architecture with graceful degradation:
- **Server-side**: `src/app/actions/analytics.ts` dynamically creates a Convex client per-tenant and fires `analytics:trackEvent`
- **Client-side**: `src/hooks/use-analytics.ts` buffers events in a ref array, flushes to Convex every 5 seconds
- **Provider**: `src/components/customer/analytics-provider.tsx` wraps Convex; no-ops if `convex_deployment_url` is null
- **Platform analytics**: `src/lib/queries/analytics-server.ts` queries Supabase directly for superadmin dashboard (`getTopActiveTenants`, `getTotalOrders`)

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

### Receipt payment lines

The receipt engine (`webnegosyo-app/lib/receipt-layout.ts`, mirrored in `src/lib/receipt-layout.ts`; `tests/unit/receipt-layout-parity.test.ts` fails if the code drifts) prints discounts from `discount_data`/`customerData.discount`, and cash/change/ref from the caller OR the register's stored `customerData.pos` (stored cash only while cash − change still equals the total, so an edited order never reprints stale change). `amountPaid` (absent = say nothing) adds Paid / Balance due / Amount due; a fully paid cash sale adds nothing more. Classic output is unchanged for inputs without these fields.

### Tenant Branding

Tenants have 40+ customizable color fields applied via CSS variables (`src/lib/branding-utils.ts`). Card templates: classic, minimal, modern, elegant, bold, glass, polaroid, brutalist, magazine, zen, neon, storefront (fixed designs), plus the **flexible** set — showcase, atelier, kiosk, sticker, menuboard, arch, bistro — built on `card-templates/flex/card-kit.tsx` and tuned by six `card_*` knob columns (`src/lib/card-style.ts`; NULL/`auto` = template default, per-device via `mobile_overrides`). A new flexible design is flagged `isFlexible` in `CARD_TEMPLATES` and composes the kit. Page layouts add storefront, kiosk, rails, lookbook — scroll-based catalogs sharing `layouts/layout-parts.tsx` + `useCategoryScrollSpy`. The Studio pickers and the SmartMenu MCP (`get_branding` `designCatalog`, `src/lib/mcp/design-catalog.ts`) derive from `CARD_TEMPLATES` / `PAGE_LAYOUTS`, so registering a design there is the only edit. The `compact` card was retired 2026-09-24 (stores moved to `menuboard`).

Dev gotcha (fixed 2026-10-04): `next.config.ts` used to mark `/_next/static` `immutable` in dev too, and dev chunk names don't change, so browsers kept stale CSS/JS after edits. The header is now production-only; a browser that cached a chunk before the fix needs one hard refresh.

### Hero Builder (custom storefront hero)

`/[tenant]/admin/hero-designer` (sidebar: "Hero Builder", full-screen like Branding Studio) edits a **v5 flow design**: sections → columns → widgets, each node a desktop `style` + optional `tablet`/`mobile` partial overrides (desktop-first cascade, `resolveStyle`). Nothing is absolutely positioned, so a design cannot overflow a phone.

- **Engine** `src/lib/hero-builder/` (pure, tested in `tests/unit/hero-builder/`): `types`, `schema` (save-time zod), `tree-ops` (immutable edits), `editor-state` (reducer + coalesced undo), `css` (design → ONE scoped sheet using `@container hb` queries — the storefront renders the design once; the editor's 1280/820/390px frames show real layouts because breakpoints are container widths), `load` (parse + v4→v5 on the fly), `templates` / `section-presets`.
- **`tenants.hero_design` is a TEXT column** — the API returns a JSON string. Always read it through `loadHeroDesign` / `hero-mode.ts`; `design.version` on the raw value is always undefined (this silently disabled every custom hero before v5).
- A custom hero renders ONLY when `hero_preset === 'custom'`; `publishHeroDesignAction` validates, stores and sets it. v3 (absolute) designs keep the legacy `HeroRenderer`.
- **Every value is re-validated at render** (`safe-values.ts`) because the sheet is injected into `<style>`; table lookups use own-property checks (`constructor`/`__proto__` keys once crashed the sheet build).
- **Custom code**: "HTML & CSS" = DOMPurify (browser-side, at output) into a shadow root with `contain: layout paint` (styles can't leak, `position:fixed` can't escape the box). "Embed" = `srcdoc` iframe sandboxed WITHOUT `allow-same-origin`/`allow-top-navigation`; only height messages from that frame's own window are honoured.

### Welcome Builder (custom welcome page)

`/[tenant]/admin/welcome-designer` (sidebar: Store Setup → "Welcome Builder", full-screen) is the SAME editor as the Hero Builder, driven by a `BuilderSurface` (`components/hero-builder/editor/surface.ts`: title, templates, Add groups, section presets, publish/unpublish, link surface). A change to the shared editor ships to both builders.

- **Stored** in `tenants.welcome_design` (TEXT, v5 JSON, read via `loadHeroDesign`) + `welcome_design_enabled` (published = true; "Turn off welcome page" clears it, keeps the design). Both are tenant-admin writable (not in the privileged-column guard). `resolveCustomWelcomeDesign` (`lib/welcome-builder/welcome-mode.ts`) is the one reader.
- **Welcome-only blocks** (engine-wide kinds, offered only in the welcome Add panel except Slideshow): `order-entry` ("How to order": tiles / list / one button; shows only the order types actually on offer, falls back to the button when none), `store-logo` (branding logo; name or nothing as fallback), `slideshow`. They read the live store from `WelcomeRuntimeProvider` (`renderer/welcome-runtime.tsx`); outside a provider they render a sample store. `{store}` in heading/text becomes the store name only under a provider.
- **Links**: `#welcome-start` and `#welcome-mode-<dine_in|pickup|delivery>`. On the welcome page menu/category/product links ALSO start an order (no menu exists before a branch is chosen); on the menu they scroll to the menu.
- **A way in is guaranteed**: `publishWelcomeDesignAction` refuses a design with no visible entry on any device (`entryProblem`), and the storefront appends a device-scoped start button to any stored design that lacks one (`withGuaranteedEntry`).
- **Where it shows**: multi-branch stores with the branch picked BEFORE the menu → it replaces the classic first screen of `OutletSplash` (tiles carry the mode to the branch list; start = mode-less). Every other store (single location, or branch at checkout) → `WelcomeLanding` over the menu once per browser session (`sessionStorage wn-welcome-seen:<slug>`), skipped for `?table=` links; a tile sets the cart's order type. The server always renders it open; an inline pre-paint script (`hideIfSeenScript`) hides it for a returning visitor before hydration, and while order types load the tiles render as a non-tappable placeholder (`isLoadingModes`) so the start button never swaps to tiles under a thumb.
- **Templates** `lib/welcome-builder/templates*.ts` (12, phone-first, every one publishable as-is — pinned by `tests/unit/welcome-builder/templates.test.ts`); section presets in `section-presets.ts`. Thumbnails render at 390px with `viewportHeight` so "fill the screen" sections don't use the real viewport.

### Store onboarding (paid-first set-up link)

`/onboarding/[token]` builds a paying merchant's store for them. The token (256-bit, only its sha256 stored in `store_onboardings`) is the buyer's only credential.

- **Link only after payment**: the funnel never mints one. Staff mark the checkout lead Paid, then "Send set-up link" (`issueLeadSetupLink` refuses unpaid leads) or "Invite paid customer" (creates a lead already `paid`). The share panel builds the message + `sms:`/`mailto:` drafts (`src/lib/onboarding/invite.ts`); nothing is sent server-side.
- **Sign-up links** (`/superadmin/checkout-leads/invites`, `src/lib/onboarding/invites/`): a ONE-USE link `/onboarding/join/<code>` not tied to any lead — the customer types their own name/business/email/phone and becomes a `paid` lead at the link's plan, then lands in the normal wizard. `onboarding_invites` is service-role only and stores the code's sha256 (the link is shown once). The claim is ONE conditional UPDATE (unclaimed, not revoked, unexpired); a use is given back only while no lead is attached. The taken-email check (`onboarding_email_taken` RPC) runs BEFORE the claim. The redeeming browser gets an httpOnly `wn_join` cookie scoped to the link's path, so reopening the used link resumes its wizard; anyone else sees "already used". Live check: `ONBOARDING_INVITES_LIVE=1 npx jest tests/live/onboarding-invites-live.test.ts`.
- **Wizard** (`src/components/onboarding/`, Airbnb-style: one question per screen, fixed footer progress + Back/Next, white studio wearing only the owner's brand via `--ob-accent`; direction contract atop `onboarding-ui.tsx`): welcome → store → brand (logo, named colors, **menu layout** = `answers.look`) → menu → ordering → hours → account, beside a live phone preview that mirrors the real storefront, built with the SAME `buildLaunchBranding` palette. `LiveStoreFrame` renders the real store at 390px scaled into the frame. The logo's color is read at upload (`assets.logoColor`) and re-themes the wizard (`--ob-accent`); `answers.brandColor` (hex, validated) wins in the build (`pickLaunchBrandColor`). Submit creates the tenant (pre-launch, platform backend) + owner, then signs the browser in.
- **Build** (`src/lib/onboarding/build.ts`, background `after()`): branding → menu (AI parse) → payments/hours/order types → Boost offers → starter stamp card. Steps never re-run once settled.
- **Photo-less design**: onboarded menus have no dish photos, so `STORE_LOOKS` (`store-type.ts`: board / chapters / tiles / cards) pairs a card, layout and a TEXT hero (heroes with a picture panel draw giant initials); each store type has a default look. A dish without its own photo shows the store logo in every card template (the 2026-10-08 text-card change was reverted 2026-10-09 at the owner's request — don't reintroduce it).
- **Go live is automatic**: when the build finishes, `openStoreWhenReady` (build.ts) runs `launchFromSetupLink` on the FINISHED row — the same rules as the reveal's button (`{action:'launch'}` → `decideBuyerLaunch`: store built, lead paid|live, no readiness blockers). A refusal leaves the store in pre-launch and the reveal shows what to fix; it never fails the build. `is_prelaunch` is privileged (service role only). The admin `/[tenant]/admin/launch` page keeps the older two-key path.

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
