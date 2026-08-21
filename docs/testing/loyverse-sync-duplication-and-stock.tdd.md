# Loyverse sync: re-sync duplication + out-of-stock propagation

TDD evidence report. Branch `lalamove-overhaul`. Date 2026-08-21.

## Source plan

No `*.plan.md`. Journeys were derived during this run from two merchant-reported
symptoms:

1. "When I resync again to get the missing item, the other gets duplicated."
2. "If the item is out of stock on Loyverse it should be out of stock here as well."

Root-causing was delegated to two parallel read-only investigation agents, then
every decisive claim was re-verified by direct reading before any code changed.

## User journeys

- As a merchant, I want to re-run the Loyverse sync to pick up an item I just
  added, so that my menu is complete — **without** my existing dishes appearing
  twice.
- As a merchant, I want a dish that is dry in Loyverse to stop being orderable
  on my storefront, so that I never have to cancel an order I cannot fulfil.
- As a merchant, I want stock to stay correct even if the webhook connection
  silently dies, so that the integration does not quietly rot.
- As a merchant, I want the duplicates already in my live menu identified before
  anything is deleted, so that I do not lose order history.

## Root causes (verified, not assumed)

### 1. Duplication — identity lived in derived data

`menu_items` had no Loyverse id column. The only link between a Loyverse item
and a local dish was `loyverse_item_map`, which `importLoyverseCatalog` rebuilt
destructively (`delete` all → batch `insert`) **after** its per-item loop
(`catalog-import.ts:309-318` pre-fix). The loop mirrors an image per item, so a
large catalog can outrun the function timeout — leaving dishes created and the
map empty. The merchant-facing action `src/app/actions/loyverse.ts:59` sets no
`maxDuration`, while `reconcile/route.ts:8` sets `300` with the comment "well
beyond a lambda default."

One mechanism produces both reported symptoms: run 1 times out → partial menu
("items missing") → merchant re-syncs → empty map matches nothing → whole
catalog re-inserted. No UNIQUE constraint on `menu_items` existed to catch it.

Two further paths to the same empty map: the single batch map `insert` failing
(only a warning — `report.success = true` was set unconditionally), and
`ON DELETE CASCADE` erasing a dish's map row when a merchant deletes it.

**Ruled out:** pagination in `client.ts` is correct (`limit: 250`, absent and
empty-string cursors both terminate; covered by `loyverse-client.test.ts`).

### 2. Out-of-stock — correct logic, undeliverable signal, plus one real bug

The write path was already right: `applyLoyverseInventoryLevels` really does set
`is_available: false`, and a full manual sync 86s dry items via
`catalog-import.ts:269`. Untracked items correctly stay available.

- **Delivery.** `LOYVERSE_WEBHOOK_SECRET` fails closed in three places at once —
  registration (`webhooks.ts:76`), the receiver (`webhook/route.ts:25`), and
  reconcile (`reconcile/route.ts:24`). It appears nowhere in the repo: not in
  `.env.local`, not in `scripts/validate-env.mjs`. There was **no `vercel.json`**,
  so the reconcile safety net was never scheduled.
- **Multi-variant bug.** `partitionAvailabilityChanges` compared the webhook
  batch against *every mapped variant* of the dish. Loyverse sends one delta per
  variant, so `allVariants.every(...)` was effectively unsatisfiable and a
  multi-size dish stayed orderable after selling out.
  Note: the code comment claimed "every variant in THIS batch", but that intent
  is **also wrong** — it would 86 a dish the moment one size ran out while
  another was stocked. The defect is missing state, not a too-wide window.
- **Staleness.** No `revalidatePath` after an availability flip, while the menu
  is ISR at `revalidate = 300`.

## Task report

| Task | Validation command | RED | GREEN |
|---|---|---|---|
| Durable menu-item identity | `npx jest tests/unit/loyverse-catalog-import-idempotency.test.ts` | 3 failed, 3 passed, 6 total | 6 passed |
| Multi-variant stock decision | `npx jest tests/unit/loyverse-inventory` | 3 failed, 16 passed, 19 total | 19 passed |
| Live stock check at checkout | `npx jest tests/unit/loyverse-checkout-stock-guard.test.ts` | Cannot find module `@/lib/loyverse/stock-check` | 9 passed |
| Reconcile cron authorization | `npx jest tests/unit/loyverse-reconcile-auth.test.ts` | Cannot find module `@/lib/loyverse/reconcile-auth` | 8 passed |
| Duplicate-cleanup planner | `npx jest tests/unit/loyverse-dedupe-plan.test.ts` | Cannot find module `@/lib/loyverse/dedupe-plan` | 8 passed |

RED for the first two was **runtime** RED (suite compiled, tests ran, failed for
the intended reason). RED for the last three was **compile-time** RED: the test
newly referenced a module that did not exist.

Note on the first task: the "clean re-sync" case **passed before the fix**. Only
an interrupted or failed sync loses the match key — which is why this never
reproduced in testing and only bit a live merchant.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A clean re-sync updates the dish rather than creating a second | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 2 | An interrupted first sync (map lost) still matches on the next run | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 3 | The Loyverse item id is recorded on the menu row itself | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 4 | Adding a missing item does not duplicate the existing ones | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 5 | Map rows are written per item, not only after the whole loop | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 6 | A failed map write cannot cause duplication next run | `loyverse-catalog-import-idempotency.test.ts` | unit | PASS |
| 7 | A dish 86s when its LAST variant sells out in its own delta | `loyverse-inventory-remembered-stock.test.ts` | unit | PASS |
| 8 | A dish stays orderable while another variant has stock | `loyverse-inventory-remembered-stock.test.ts` | unit | PASS |
| 9 | Unknown stock reads as available, never as out | `loyverse-inventory-remembered-stock.test.ts` | unit | PASS |
| 10 | An incoming batch overrides stale remembered stock | `loyverse-inventory-remembered-stock.test.ts` | unit | PASS |
| 11 | Levels to persist are reported, and scoped to the mapped store | `loyverse-inventory-remembered-stock.test.ts` | unit | PASS |
| 12 | Only a positive report of zero blocks a checkout | `loyverse-checkout-stock-guard.test.ts` | unit | PASS |
| 13 | Unmapped / unreported / other-store dishes never block checkout | `loyverse-checkout-stock-guard.test.ts` | unit | PASS |
| 14 | A negative Loyverse level counts as empty | `loyverse-checkout-stock-guard.test.ts` | unit | PASS |
| 15 | An unset secret can never authorize the reconcile cron | `loyverse-reconcile-auth.test.ts` | unit | PASS |
| 16 | Both `?secret=` and `Bearer $CRON_SECRET` authorize | `loyverse-reconcile-auth.test.ts` | unit | PASS |
| 17 | Dedupe keeps the row carrying the Loyverse identity | `loyverse-dedupe-plan.test.ts` | unit | PASS |
| 18 | Dedupe never groups across tenants or categories | `loyverse-dedupe-plan.test.ts` | unit | PASS |
| 19 | Two rows that both carry an identity are never nominated | `loyverse-dedupe-plan.test.ts` | unit | PASS |

## Coverage and known gaps

```
npx jest tests/unit --testPathIgnorePatterns "/.claude/worktrees/"
  Test Suites: 499 passed, 499 total
  Tests:       5993 passed, 5993 total

npx jest tests/unit/loyverse --coverage --collectCoverageFrom="src/lib/loyverse/**/*.ts"
  All files  78.6 % stmts | 84.29 % branch | 82.22 % funcs
    dedupe-plan.ts          100 %      reconcile-auth.ts       100 %
    config.ts               100 %      payment-methods-sync.ts 100 %
    catalog-import.ts     85.43 %      catalog-mapper.ts     98.13 %
    stock-check.ts        71.42 %      inventory-sync.ts     69.67 %
    push-service.ts           0 %  (pre-existing, untouched)
```

**Below the 80 % target, honestly stated.** Two reasons, neither hidden:

- `push-service.ts` sits at 0 % and is untouched by this work; it alone pulls the
  directory average under the line.
- `stock-check.ts` and `inventory-sync.ts` are split by design into a pure,
  fully-covered decision function and a thin network/DB half
  (`findLiveOutOfStockLines`, `applyLoyverseInventoryLevels`). The uncovered
  lines are exactly those glue halves.

Every decision function introduced or changed here is covered. Raising the
directory number means testing `push-service.ts`, which is out of scope for this
fix.

**Untested by design / deferred:**

- The end-to-end webhook → 86 path against a real Loyverse account. Still the
  outstanding live verification from the original integration.
- `scripts/loyverse-dedupe.ts` I/O glue (report-only by default; the nomination
  logic it depends on is at 100 %).
- The full `next build` could not be used as a gate this session: it fails in
  `src/components/admin/order-type-detail.tsx` on `after_billing_payment_enabled`,
  from commit `3a23d7c` — a **concurrent session's** work on this shared tree,
  unrelated to these changes. `tsc --noEmit` reports no errors in any Loyverse
  file or in `src/app/actions/orders.ts`, and `eslint src/lib/loyverse` is clean.

## Merge evidence

Checkpoint commits on `lalamove-overhaul`, oldest first:

| Commit | Stage |
|---|---|
| `fab2861` | RED — reproducer for re-sync duplication (3 failed / 6) |
| `101cc4a` | GREEN — identity column + per-item map writes (6 passed; 184 loyverse) |
| `c967f5c` | RED — reproducer for multi-variant never going out of stock (3 failed / 19) |
| `9792d59` | GREEN — remembered per-variant stock + ISR revalidate (191 passed) |
| `415c5dc` | RED — spec for live checkout stock verification (module missing) |
| `4de3836` | GREEN — `stock-check.ts` + wired into `createOrderAction` (200 passed) |
| `d6a1119` | GREEN — reconcile cron scheduled + header auth (208 passed) |
| `8e4699d` | GREEN + refactor — dedupe planner, script, stale header comment (216 passed) |

## Deployment steps (code alone does not finish this)

1. Apply migration `20260828130000_loyverse_item_identity.sql`.
2. Set `LOYVERSE_WEBHOOK_SECRET` in the Vercel project — it gates registration,
   the receiver, and reconcile simultaneously.
3. Set `CRON_SECRET`; Vercel injects it into cron requests once present.
4. Deploy, so `vercel.json` registers the 6-hourly reconcile cron.
5. Re-run the superadmin Loyverse sync per tenant to register webhooks and
   backfill `loyverse_item_id` for anything the migration could not claim.
6. Run `npm run db:loyverse-dedupe` (report-only) and review before `--execute`.
