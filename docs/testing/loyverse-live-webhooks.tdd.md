# TDD Evidence: Loyverse live webhooks — fix the silent-off sync

**Source plan**: inline `/ecc:plan` (2026-08-27) — no `.plan.md` artifact; journeys derived during the run.
**Branch**: `main` (checkpoint commits `3ead058` → `adc1b2b`)

## Diagnosis that shaped the plan

The live-webhook system already existed on main (receiver, auto-registration,
6h reconcile cron, dedup identity migration). Verified live state showed it
was not running:

- `GET https://api.loyverse.com/v1.0/webhooks` with the real merchant's token → `{"webhooks":[]}` (zero registered).
- `tenants.loyverse_last_synced_at` NULL for `anyeong-dantes-minimart` despite 222 linked items → full import never completed (per-item awaited image mirror vs function timeout).
- 22 orphan duplicate menu rows (linked twin + unlinked leftover) live on the merchant's menu.
- Registration ran only AFTER a successful import and its failures lived in an unread report object.

## User journeys

1. As a merchant, when I add or edit a product in Loyverse, it appears on my WebNegosyo menu automatically — no manual sync.
2. As a merchant with a large catalog, one sync finishes and every item lands.
3. As a superadmin, I can see whether a tenant's live sync is actually connected, and why not when it isn't.
4. As a merchant, my menu has no duplicated items.

## Task report

| # | What is guaranteed | Test file | Result | RED evidence |
|---|---|---|---|---|
| 1 | Webhooks are registered BEFORE the catalog import (a slow import can't kill registration) | `tests/unit/loyverse-sync-orchestrator.test.ts` | PASS | module missing → suite failed to resolve (`3ead058`) |
| 2 | Import still runs and report returned when registration fails; failure surfaced as warning + persisted | same | PASS | same |
| 3 | Registration success stamps `loyverse_webhooks_registered_at`; failure records only the error (past stamp not erased) | same | PASS | same |
| 4 | Every menu item is written before the first image mirror starts | `tests/unit/loyverse-catalog-import-deferred-images.test.ts` | PASS | `itemsWrittenAtCallTime: 0,1,2` — mirrors ran inline |
| 5 | Mirrors are capped per run (default 25); remainder keeps the renderable hotlink and the deferral is announced | same | PASS | 3 mirror calls with cap 2 expected 2 |
| 6 | `loyverse_last_synced_at` is stamped even when every mirror fails | same | PASS | (new guarantee) |
| 7 | Webhook status renders as ok/error/pending; error always beats stale success | `tests/unit/loyverse-webhook-status.test.ts` | PASS | helper missing → suite failed to resolve |

Validation commands actually run:

```
npm test -- --testPathPatterns="loyverse"   # 152 passed (19 suites)
npm test                                     # 6231 passed, 8 skipped (527 suites)
npx eslint <touched files>                   # 0 errors
```

## Production changes outside code

- Migration `loyverse_webhook_status` APPLIED live (adds `tenants.loyverse_webhooks_registered_at`, `loyverse_webhook_error`). Local file `supabase/migrations/20260829120000_loyverse_webhook_status.sql`.
- Live cleanup: deleted the 22 orphan duplicates for `anyeong-dantes-minimart` after verifying zero references across all 10 FK-referencing tables (order_items, recipes, upsell/complementary pairs, outlet_menu_items, loyverse_item_map, tags, analytics, product_costs, hero). Post-state: 222 items, 0 duplicate names.

## Coverage and known gaps

- New pure modules (`sync-orchestrator.ts`, `webhook-status.ts`) are fully covered; catalog-import's deferred-mirror path covered by the new harness suite.
- Deliberately untested: the superadmin banner JSX (presentational; logic lives in the tested `describeLoyverseWebhookStatus`).
- OUTSTANDING to go live: `LOYVERSE_WEBHOOK_SECRET`, `CRON_SECRET`, `PLATFORM_APP_URL` must be set in Vercel production and the app redeployed; then one sync/reconcile registers the webhooks. End-to-end propagation (edit in Loyverse → menu updates) verified only after that.

## Merge evidence

Checkpoints on main: RED `3ead058`, GREEN `405961f` (orchestrator), RED+GREEN `cb1dc9a` (deferred images), GREEN `adc1b2b` (status UI).
