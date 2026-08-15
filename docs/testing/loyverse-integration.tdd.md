# TDD Evidence — Loyverse POS Integration (Phases 1–4)

**Source plan**: presented inline in-session (2026-08-15) via `/ecc:plan`; user confirmed with `/ecc:tdd-workflow proceed`.
**Scope shipped**: Phase 1 foundation, Phase 2 catalog sync, Phase 3 order push, Phase 4 inventory awareness. Phase 5 (OAuth + marketplace) not started.

## User journeys

1. As a superadmin, I connect a tenant's Loyverse account (token + store + payment type) and the platform rejects a half-configured enable.
2. As a merchant, my Loyverse catalog (categories, items, variants, modifiers, images, per-store prices) becomes my WebNegosyo menu, and re-syncs stay stable (no id churn).
3. As a merchant, orders reach Loyverse as completed sales receipts — either the moment a customer orders (`on_create`) or when I confirm (`on_confirm`) — from web checkout, web admin, the merchant app, and POS counter sales.
4. As a merchant, when a tracked item runs dry in Loyverse, the dish shows "out of stock" on my menu, and comes back when stock does.

**Architectural constraint (research-verified)**: Loyverse has NO open-ticket API — `POST /receipts` creates completed sales only. Pushed orders never appear on the cashier's Loyverse register; the incoming-order experience stays on the WebNegosyo side.

## Test specification

| # | What is guaranteed | Test file | Result |
|---|---|---|---|
| 1 | Config readiness rules (disabled / incomplete / ready), push-mode coercion to `on_confirm` | `tests/unit/loyverse-config.test.ts` (8) | PASS |
| 2 | API client: bearer auth, query serialization, 429/5xx retry w/ backoff, non-retry 4xx incl. 402, cursor pagination, connection test | `tests/unit/loyverse-client.test.ts` (11) | PASS |
| 3 | tenantSchema: enable-requires-token+store, strict push-mode enum, credentials survive disable | `tests/unit/loyverse-tenant-schema.test.ts` (5) | PASS |
| 4 | Catalog mapping: store-price precedence, 1-axis → single-select group, 2–3 axes → combined exact-priced group, modifiers → optional groups, deterministic `lv-`/`lvm-` ids, sold-by-weight/variable-price skipped w/ warnings | `tests/unit/loyverse-catalog-mapper.test.ts` (9) | PASS |
| 5 | Map-row inserts: menu_item attach, cross-item modifier dedupe, failed-import drop | `tests/unit/loyverse-catalog-import.test.ts` (3) | PASS |
| 6 | Receipt builder: base variant, name→`lv-` variant resolution, `lvm-` line modifiers, unmapped-line note, optional payment, line notes | `tests/unit/loyverse-order-push.test.ts` (7) | PASS |
| 7 | Inventory partition: store filter, all-variants-out rule, any-variant-back restore, unmapped ignore | `tests/unit/loyverse-inventory.test.ts` (6) | PASS |
| 8 | App POS line mapping by option-id prefix | `webnegosyo-app/lib/loyverse-notify.test.ts` (3) | PASS |
| 9 | Superadmin form action writes every loyverse column (drift guard) | `tests/unit/tenant-update-payload-drift.test.ts` | PASS (was RED after schema add; fixed `src/actions/tenants.ts`) |

Evidence commands: `npx jest --config jest.config.cjs tests/unit/loyverse` → **49 passed**; `npx jest lib/loyverse-notify.test.ts` (in webnegosyo-app) → **3 passed**. RED states were captured per module before implementation (see commit sequence `test:` → `feat:` on main, 2026-08-15).

## Coverage and known gaps

`src/lib/loyverse/` coverage: config 100%, client 97%, mapper 98%, order-push 89%; the uncovered remainder is service-key/DB glue (`catalog-import` write loop, `push-service`, `applyLoyverseInventoryLevels`) — this repo's convention is pure-module testing with live probing for glue.

Intentional gaps / follow-ups:
- **Live verification pending**: no Loyverse sandbox exists. Verify with a free account + device: do API receipts deduct tracked stock, and do they appear in the POS app receipt list?
- Convex / tenant-Supabase orders record no push outcome (no platform row); their once-only guarantee is the confirm transition / tender completion.
- `LOYVERSE_WEBHOOK_SECRET` env var must be set and webhooks registered per merchant in Back Office (`items.update`, `inventory_levels.update` → `/api/loyverse/webhook?tenant_id=…&secret=…`).
- Double-deduction: local inventory (`inventory_enabled`) and Loyverse stock are independent; a tenant should use one. Not enforced in code.
- Pre-existing, unrelated failure left alone: `tests/unit/vouchers/engine-parity.test.ts` — `webnegosyo-app/lib/order-summary-rows.ts` drifted ahead of the web copy in PR #38 (commit 561c35f).

## Round 2 (2026-08-15, same day): full auto-sync + image fix

New guarantees, same RED→GREEN cadence (commit pairs on main):

| # | What is guaranteed | Test file | Result |
|---|---|---|---|
| 10 | Stock-aware sync: tracked item 86'd at 0 stock, untracked never, missing level = in stock, other-store levels ignored, multi-variant all-out rule | `tests/unit/loyverse-catalog-mapper.test.ts` (+6) | PASS |
| 11 | Image mirror decision: mirror onto ImageKit when local image empty or a Loyverse hotlink; never clobber a merchant-hosted image | `tests/unit/loyverse-image-mirror.test.ts` (5) | PASS |
| 12 | Webhook planning: registers both events, idempotent on (type,url), re-enables DISABLED, ignores foreign URLs | `tests/unit/loyverse-webhooks.test.ts` (5) | PASS |

Also shipped (glue, covered by the pure tests above): `GET /inventory` folded into every sync; fallback "Menu" category so no item is ever skipped for lacking one; `ensureLoyverseWebhooks` called from the sync action (origin from request headers, env fallback `PLATFORM_APP_URL` / `https://www.<PLATFORM_ROOT_DOMAIN>`); `GET /api/loyverse/reconcile?secret=<LOYVERSE_WEBHOOK_SECRET>` re-imports every Loyverse tenant and revives disabled webhooks — point a Vercel cron at it (~6h); `api.loyverse.com/image/**` added to next.config remotePatterns (fixes the next/image crash; also the fallback when an ImageKit mirror fails).

Full suite after round 2: 5703 passed; the only failure remains the pre-existing `vouchers/engine-parity` drift from PR #38.

## Migration

`supabase/migrations/20260821120000_loyverse_integration.sql` — APPLIED to the platform DB 2026-08-15 and probed (tenants ×6 cols, orders ×4 cols, `loyverse_item_map` + RLS).
