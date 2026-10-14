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

### Inventory ledger: stock changes only through a movement

The Reports & Inventory suite (`docs/plans/2026-10-12-reports-and-inventory-suite.md`) reads every profit, variance and stock-value figure from `stock_movements`, so the database refuses anything from a CLIENT role (`anon`/`authenticated`) that would bypass it. Applied 2026-10-12 (`20261012170000_inventory_ledger_guards.sql`, `20261012170100_inventory_write_scopes.sql`):

- `inventory_items.current_qty` / `inventory_stock.current_qty` are written ONLY by `apply_stock_movement` (it runs as the invoker, one trigger level down, so the guards pass `pg_trigger_depth() > 1`). Client inserts start at 0; a branch shelf row is never deleted (no row = ZERO stock). Ingredient writes need `menu`.
- A client movement needs `menu` and may only be `receive` (≥ 0), `waste` (≤ 0), `stocktake`, or a transfer leg bounded by its transfer (item on it, |delta| ≤ sent, `transfer_out` from the sender while draft, `transfer_in`/shortfall waste while sent, each leg once — `20261012170200`). `sale`/`void` and any `order_id` come from the service role only. `stock_unit_id` can't change while the item holds stock.
- `order_stock_applications` (deduction claims) are service-role writes only. Recipes, components and units need `menu` on a store-wide account (`app_user_may_reach_branch(tenant, NULL)`); a branch-locked UPDATE is refused with zero rows, so writers must check affected rows.
- The receiving branch of a transfer may only record what arrived. Actor/time stamping and the `menu` check on movement inserts belong to the Store Activity security floor (`20261012140000`), not here.
- A new server writer of stock must use the service role or go through a movement; a new client path that changes `current_qty` directly will fail with 42501.
- **Costs are frozen by the ledger** (`20261012180000_inventory_frozen_cost.sql`, applied 2026-10-12). A `receive` keeps the price it was given (per STOCK unit; blank = uncosted) and `apply_stock_movement` blends the weighted average under the row lock — never blend in app code. Every other movement's `unit_cost` is set by the database whatever the caller sends: a void reuses what its order took out, a transfer arrival/shortfall reuses its departure, the rest freeze today's cost (prep = recipe ÷ yield via `inventory_effective_unit_cost`, the SQL mirror of `costing.ts` — change both; `INVENTORY_COST_LIVE=1 npx jest tests/live/inventory-frozen-cost-live.test.ts` checks parity). Reports value movements at their frozen cost, never today's. NULL = not recorded (pre-2026-10-12 or uncostable).
- `order_items.category_name` = the category at sale (NULL before 2026-10-12 → report "by current menu"). Dish cost at sale lives in `order_item_costs` (recipe, else typed product cost), NOT on `order_items`, because every staff account that can see an order can read its lines.

### Sales numbers: one definition (`src/lib/reports/`)

"Net sales", discounts, collected, unpaid and payment-method totals are defined ONLY in `src/lib/reports/sales-model.ts` + `payment-buckets.ts` (plan §5; `docs/testing/reports-sales-model.tdd.md`). Don't add another revenue formula.

- Money is integer centavos (`money.ts`). The order TOTAL is the authority: gross = total − service − (delivery − delivery discount) + food discount; lines are scaled to it. Σ items = Σ categories = Σ channels = Σ branches = net, exactly.
- A ledger `refund` is change returned after an edit lowered the bill — never subtract it from sales again. Unpaid money is never shown under the checkout method; over-collection is "Overpaid".
- `orders.discount_data` is the one stored discount and `discount_total` is derived from it by the `orders_sync_discount_total` trigger (POS blob copied in, removal clears both, forged values overwritten) — `20261013090000`/`090100`. That trigger is SECURITY INVOKER and runs as anon at checkout: any helper it calls must be executable by anon.
- Convex `getDashboardStatsByPeriod` is inclusive at both ends: half-open callers pass `inclusiveEndFor(end)` (`src/lib/convex/period-bounds.ts`), never `end` or `end − 1`.
- Live reconciliation: `SALES_LIVE=1 SALES_LIVE_TENANT=… SALES_LIVE_FROM=… SALES_LIVE_TO=… [SALES_LIVE_EXPECT=…] npx jest tests/live/sales-model-live.test.ts`.

### Sales reports (`/admin/reports`, platform stores)

Phase 1 of the suite (`docs/testing/reports-phase1-sales.tdd.md`). Overview at `/[tenant]/admin/reports`; breakdowns at `/admin/reports/[dim]` (`items` incl. `?view=matrix`, `categories`, `payments`, `channels`, `hours`, `branches`). Product Analytics redirects there on platform stores; Convex/tenant-DB stores keep it (reports for them = Phase 7).

- **SQL twins of the engine**: `report_sales_summary` / `_by_period` / `_by_dimension` / `_by_hour` / `_by_item` / `_by_category` / `report_payments` (`20261014110000` + `130000` + `140000` + `150000`), SECURITY INVOKER (RLS applies) + `reports` key (42501), ≤93 days, helpers in the non-exposed `reporting` schema. A change to `sales-model.ts`/`payment-buckets.ts`/`sales-breakdowns.ts` must change the SQL too — `tests/unit/reports/report-sql-parity.property.test.ts` (PGlite via `tests/sql/report-sales-worker.cjs`) fails on any centavo of drift; `report-sql-access.test.ts` pins who may call them.
- **Read through the caller's session client only** (`src/lib/reports/read/report-rpc.ts`); never a service-role client. Pages decide access/period/branch in `report-context.ts` (fails closed; a branch-locked account always reads its own branch whatever the URL says).
- **Children by `order_id = any(array(select …))`, plpgsql `RETURN QUERY EXECUTE … USING`.** A SQL-function version hash-joined all of `order_items` under RLS and took the platform DB down for 8 minutes (2026-10-14). Any live probe of a report function starts with `set local statement_timeout = '5s'` and a one-day window.

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
- **AI generations** (`src/lib/boost/ai/`, `src/app/actions/boost-ai.ts`): `FREE_BOOST_AI_GENERATIONS` (3, lifetime per store) runs via OpenRouter (`src/lib/ai/openrouter.ts`, same models as the menu parser). The model sees short item refs (`i12`), never UUIDs; `proposals.ts` drops anything that fails validation. Runs + proposals live in `boost_ai_generations` / `boost_ai_proposals` — service-role writes only (the log IS the quota); `claim_boost_ai_generation` reserves a slot atomically and failed runs don't count; only `source='ai'` rows count (onboarding's launch combos are a `source='launch'` generation). Proposals go pending → approved → applied (never live without approval); apply reads the payload from the DB and goes through the same `ideaToWrite` mapping as one-tap ideas.
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

### Owl mascot (animated, merchant-facing only)

`<Owl state="idle|happy|thinking|waiting|sorry|celebrating|sleeping" size framing="full|bust" label? />` (`src/components/mascot/`). NEVER on diner storefronts — those are white-labeled as the store's brand.

- **Art is generated**: `node scripts/mascot/build-owl-svg.mjs` writes `public/assistant/owl-mascot.svg` AND `src/components/mascot/owl-art.generated.ts` (never hand-edit either). Source modules in `scripts/mascot/lib/` (left side only, mirrored); traced from `scripts/mascot/reference-sheet.png`. `tests/unit/mascot/` fails if the two outputs drift.
- **Rig**: every moving part is `<g class="o-<part>">` with an inline transform-origin and NO transform attribute (`lib/rig.mjs`); expression variants (happy/closed eyes, lids) and effects (`fx-*`) start at opacity 0.
- **States** live only in `owl.module.css`: a state = face (static poses) + motion (animations); reduced motion keeps the face. New state → add to `OWL_STATES` + CSS (test-enforced).
- Ids are prefixed per instance (`useId`); under 120px the blurred shading is dropped (`toLite`).
- Used in: assistant launcher/header (`owl-mood.ts`: sorry > thinking > happy-after-Confirm > idle), onboarding wizard guide (`guide-owl.ts`), build screen, reveal, Start here, admin error boundary, empty orders/menu/customers.

### SMS automations (texts that send themselves)

Owners switch on per-moment texts — review request, thank first-timers, almost-there, reward waiting/expiring, win-back, regulars gone quiet — in the merchant app (Reports → **Texts**). The SERVER decides who gets a text; the store's enrolled Android phone only delivers. Plan: `docs/plans/2026-10-12-sms-automations.md`.

- **Engine** `src/lib/sms-automations/` (pure, `tests/unit/sms-automations/`): `recipes.ts` (the ONE registry: defaults, limits, EN + Taglish GSM-7 messages, priority, family; contract test over every entry), `candidates.ts` (who qualifies + OCCURRENCE KEY: `lapse:<last_order_at>`, `order:<id>`, `step:<program>:<cycle>:<rung>`, `reward:<id>`…), `planner.ts` (consent/opt-out/suppression, one text per occurrence per FAMILY, re-entry gap, ONE automated text per guest every N days with the highest priority winning, quiet hours HOLD via `not_before`), `template.ts` (placeholders a recipe may use; `toSmsSafe` keeps texts GSM-7; guest-typed names are cut to name-like words), `eta.ts`, `write-copy.ts` ("Write it for me" gate: no invented numbers/prices/links/claims).
- **Data** (`20261013120000_sms_automations.sql` + `…140000_sms_outbox_hardening.sql`, applied): `sms_automations` (one per tenant+recipe), `sms_settings` (quiet hours, cap days, daily limit, review link), `sms_outbox` — UNIQUE `(tenant_id, family, customer_id, occurrence_key)` IS the dedupe; inserts ignore duplicates. Staff with `customers` (store-wide only) may SELECT; every write is service role or a definer RPC.
- **Delivery is AT MOST ONCE**: `claim_sms_outbox_message` (device credential, per-store advisory lock) re-checks consent, opt-out, suppression, the guest's phone, exit-on-order, reward still claimable, automation still on, quiet hours, daily limit, per-guest cap (incl. campaign sends + unconfirmed texts) and 25 per 30 min per phone (incl. reward codes), then releases the body ONCE. A phone that never reports leaves the row `claimed`; the sweep fails it `unconfirmed` after 15 min and it is NEVER re-sent.
- **Server**: `POST /api/sms/automations/tick` (Vercel cron, 5 min, CRON_SECRET; only stores with an automatic automation ON **and** an enrolled phone — a queued text burns its occurrence; `fresh` mode = guests who just qualified). `POST /api/sms/automations` (bearer, `customers`, one strict zod action: list/save/preview/set_status/run_now/save_settings/cancel_waiting/activity/write). Phones: `POST /api/sms/outbox/{claim,finish}` (gated by `LOYALTY_SMS_DELIVERY_ENABLED` like the gateway). Enrollment no longer needs loyalty; a loyalty claim in a store without loyalty answers `job:null`, never 403 (403 = revoked → the phone wipes its enrollment).
- **Phone** (`webnegosyo-app/lib/sms-automations/`): the gateway's worker is a combined sender — reward codes ALWAYS first, automated texts only when the code queue is idle and their own schedule allows (15 s gap, server waits, 1-min idle poll). Own journal (`sms.outbox.ack.v1…`); a crash mid-send is reported failed, never retried. Needs an EAS Android build.
- **AI**: Owl `get_sms_automations` + two-phase `propose_sms_automation` (new = Off) / `propose_sms_automation_status` / `propose_run_sms_automation` (kinds in `assistant_actions_kind_check`); operator MCP `list_sms_automations` / `save_sms_automation` (never switches on; excluded from the merchant connector). Onboarding drafts first-timers / slipping regulars / lapsed guests as automations, Off.
- **Live checks** (opt-in): `SMS_AUTOMATIONS_LIVE=1 npx jest tests/live/sms-automations-live.test.ts` — read-only dry run over real stores, an API round trip on the demo store (cleans up), and a "Write it for me" call.

### Loyalty wallet passes (Apple Wallet / Google Wallet)

A loyalty member can add their stamp card to Apple or Google Wallet from the order-tracking page (`AddToWalletButtons` inside `LoyaltyStampCard`); the POS attaches a guest by scanning it (`CustomerPickerSheet` → `MemberCardScanner`).

- **Engine** `src/lib/loyalty/wallet-pass/` (pure parts tested in `tests/unit/loyalty/wallet-pass/`): `content` renders ONE platform-neutral card (both wallets draw from it; its sha256 decides whether anything is pushed), `apple-pass-json` / `google-objects` format it, `apple-ws-route` + `apple-ws-handler` implement Apple's PassKit web service, `sync-plan` decides who hears about a change.
- **Identity**: a pass carries only a random 144-bit serial (QR `WNLC1.<serial>`), never the phone. Passes are issued ONLY for a receipt proven by its tracking token, for the number already on that order (`resolveOrderLoyaltyMember`, shared with the stamp card) — never for a typed number. Apple's per-pass token is HMAC-derived (`WALLET_PASS_AUTH_SECRET`), not stored.
- **Keeping cards current**: pg_net triggers on `loyalty_balances` / `loyalty_entitlements` / `loyalty_programs` post an id to `/api/loyalty/passes/sync` (ids only, everything re-read; gated by `X-Wallet-Sync-Secret` = Vault `wallet_pass_sync_secret` = env `WALLET_PASS_SYNC_SECRET`). Apple = APNs empty push with the pass certificate, device then pulls; Google = PATCH the object. Per-wallet watermarks (`apple_pushed_hash`, `google_synced_hash`); Google is only called for members who asked for a Google pass.
- **Routes**: `GET /api/loyalty/passes/{apple,google}` (issue), `/api/loyalty/passes/apple-ws/v1/...` (device web service), `POST /api/loyalty/passes/sync`, `POST /api/loyalty/passes/identify` (bearer, same tenant + `pos`).
- **Config** (`config.ts`) fails closed per wallet; see ENV_VARIABLES_NEEDED.txt. Swap the text buttons for Apple's/Google's official badge artwork before launch.

### Merchant notifications (the app's bell)

Header bell (Home + Manage, `components/notifications/NotificationBell.tsx`) with an unread count, list at `(main)/notifications`. First kind: low / out of stock.

- **Source**: `stock_alerts` (raised by `stock-alerts-service.ts`, gated by `low_stock_alerts_enabled`) → statement triggers write `merchant_notifications` (snapshot of item/unit/branch/qty; a new alert = `stock_low`/`stock_out`, an open low alert updated to `out` = escalation `stock_out`) → statement trigger pg_net-POSTs the ids to `/api/push/notify-merchant` → claims `push_claimed_at` once → Expo push on Android channel `stock-alerts` (never the order ringtone). One stock_alerts statement = one push call per device.
- **Who**: `app_user_may_read_merchant_notifications` = owner, full-access admins, staff with `menu` (who can open Stock), branch accounts only their branch (NULL outlet = everyone). The push recipient rule (`merchant-notification-push.ts`) and the app's `canSeeMerchantNotifications` mirror it — change all three together. Text is worded in BOTH `merchant-notification-push.ts` and the app's `merchant-notifications.ts`; `tests/unit/merchant-notification-parity.test.ts` fails when the wording or the store-wide visibility rule drifts.
- **Unread** = not resolved, newer than `merchant_notification_seen.seen_at`, counted once per ingredient shelf (low + its escalation = 1). Opening the list stores the newest notice's SERVER `created_at` as `seen_at` (`nextSeenAt`), never the phone clock. The push route gives its claim back when nothing was sent (no automatic retry — pg_net fires once). Service-role writes only on `merchant_notifications`.
- **Push taps**: `routeFromPushData` (`lib/merchant-notifications/push-route.ts`) is the app's one router — announcements, then stock alerts (single item → ingredient page, batch → list). A new kind needs: the `kind` check constraint, a trigger/writer, wording on both sides, a route.

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
- **Wizard** (`src/components/onboarding/`; direction contract atop `onboarding-ui.tsx`: white studio, Duolingo-style `TapCard`s with a pressable ledge, `--ob-accent` = the owner's brand once known): three chapters with a part-filled bar (paid = step one, `wizard-progress.tsx`) — **About you** (`wizard-about.tsx`: multi-select `goals`, `channels`, `dailyOrders`, `typicalOrder`; single-choice screens auto-advance) → **plan** (`buildLaunchPlan`, `goals.ts`; never promises a number) → **Your store** (store, brand = logo + color only — the AI picks the layout, menu, order types, payments, hours, best sellers) → **Go live** (password). Steps live in `src/lib/onboarding/wizard-steps.ts`; the draft + resume step are in localStorage. New answer fields are optional in the schema so older drafts still submit.
- **Menu read in the background** (`menu-read.ts` pure, `menu-read-run.ts`, `POST /api/onboarding/[token]/menu-read`, polled by `use-menu-read.ts`): leaving the menu step starts ONE AI read of the stored photo URLs + typed text (CAS on `assets.menuRead`, keyed by sha256 of its sources, ≤8 reads per set-up, result stored only while `awaiting_details`). Best sellers are then tapped from real dishes; the build reuses the read when the key still matches (`usableMenuRead`). `assets.menuRead` is server-only: every response goes through `publicAssets`.
- **Build** (`src/lib/onboarding/build.ts`, background `after()`): branding → menu → design (AI look + hero) → payments/hours/order types → Boost → starter stamp card → **campaigns**. Steps never re-run once settled. Boost: upgrades, pairings and last call go live; **combos never do** — they are filed as pending Boost AI suggestions in ONE `boost_ai_generations` row with `source='launch'` (`fileLaunchProposals`; never counted against the 3 free AI runs; one per store by partial unique index). ₱0 items ("Served with: Garlic Rice") never enter any offer (`ideas.ts` `isOfferable`); trade-up upgrades (Tapang Baboy → Tapang Baka, ≤25% more, same category, shared distinctive word) cover menus without "Large"/"Meal" items. Stamp card (`starter-program.ts`): reward ≈ 80% of a typical order (owner's answer, else median main/drink), preferring best sellers; `minSpend` = half a typical order (rounded to ₱10). Campaigns (`launch-campaigns.ts`): 4 REPEATING drafts (a dated one-off would be in the past by activation), validated by both the web schema and the app editor in tests; drafts text no one.
- **Reveal** (`onboarding-reveal.tsx`): the peak (Bukas na! + share the store's subdomain link / counter QR; hint follows `channels`), then up to 3 quick choices (`reveal-choices.tsx`): keep/skip each launch combo (`/api/onboarding/[token]/launch-offers` → `decideLaunchCombo`: launch-generation combos only, approve → apply as the OWNER on a service-role-read menu), the stamp card, the texts; then **Start here**. The build ledger + warnings moved to Start here.
- **Photo-less design**: onboarded menus have no dish photos, so `STORE_LOOKS` (`store-type.ts`) pairs a card, layout and a TEXT hero (heroes with a picture panel draw giant initials). Onboarding NEVER launches a store on the `menuboard` card (owner's call, 2026-10-10; test-enforced across every type/photo/look path). A black-and-white logo gives its dark ink as the brand color (`logo-color.ts`), so the store launches monochrome instead of in the store type's default color. A dish without its own photo shows the store logo in every card template (the 2026-10-08 text-card change was reverted 2026-10-09 at the owner's request — don't reintroduce it).
- **Launch hero = a real Hero Builder gallery template** (owner, 2026-10-10; reference: Karamotan Grill, which the owner hand-built on the press-quote template). `launch-heroes.ts` fills one of 10 templates (`LAUNCH_HEROES`) through the gallery builders' optional `TemplateCopy` param (`hero-builder/template-copy.ts`; no param = the gallery's own sample, unchanged). Words: the design AI writes kicker/headline/body/highlights in the same call that picks look + hero (also when the owner picked the look — sent as `fixedLook`); `launch-copy.ts` refuses any line with a digit or an unknowable claim (rated, since, free, award, best in…) and falls back field by field to honest store-type copy. Facts (hours, order types, payments, best sellers + prices) only ever come from the answers. Photos: stock Unsplash picked per store type (`launch-photos.ts`, category names may promote burger/pizza/ramen…, dish names never do); milk tea/"other" get the photo-free `how-it-works`. Templates with their own palette (press quote, chalkboard, fine dining, masthead, bakery) also paint `header_color`/`menu_main_header_text_color` to match their top band, in the same write; neutral (B&W) brands prefer those templates.
- **Go live is automatic**: when the build finishes, `openStoreWhenReady` (build.ts) runs `launchFromSetupLink` on the FINISHED row — the same rules as the reveal's button (`{action:'launch'}` → `decideBuyerLaunch`). A refusal leaves the store in pre-launch; it never fails the build. `is_prelaunch` is privileged (service role only).
- **Start here** (`/[tenant]/admin/start`, `start-path.ts` pure + `start-path-data.ts`): onboarded stores in their first 60 days (`hasStartHere`, request-cached, fails closed) get a sidebar entry, a dashboard nudge and `/admin/launch` redirects here (pre-launch stores see the launch checklist on top). Units Today / This week / Week 2 (one or two steps per goal) / Week 3; steps tick from the store's OWN data (live, launch combos decided, `platform_device_tokens`, orders since live, `has_bundle_items`, loyalty `earn` rows, active `sms_campaigns`, best-seller photos, POS orders, lessons watched). Only "I posted my link" — or a step whose data could not be read — takes a tap (`owner_path_ticks`, `canTickByHand`). Goal trackers (`goal-trackers.ts`) compare against the owner's own buckets; averages need ≥5 orders.
- **Learn** (`/[tenant]/admin/learn`, `[course]/[lesson]`): University played inside the admin; "Watch these first" (`learn-picks.ts`: current step's lessons → goal lessons → basics); "Mark as watched" writes `university_lesson_progress` (published lessons only, caller's own row). `LearnChip` beside page titles.
- **Funnel** (`onboarding_events`, first occurrence only, fixed names from `events.ts`, never answers): the wizard beacons screens via `/api/onboarding/[token]/events`; the server records submitted / build_ready|failed / live. `/superadmin/onboarding-funnel` (superadmin only) shows stage conversion, median time to first order and set-ups gone quiet before opening.

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
