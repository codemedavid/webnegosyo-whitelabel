# One sales truth: TDD evidence (Phase 0c, Reports & Inventory suite)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §5 (metric dictionary), §7.1, §9 Phase 0c, §10.1.
Date: 2026-10-13. Branch: `feat/reports-inventory`. Migrations: `20261013090000_orders_discount_total_sync.sql`, `…090010_…_anon_grant.sql` (hotfix), `…090100_orders_discount_total_hardening.sql` (applied as `orders_discount_total_sync`, `orders_discount_total_sync_anon_grant`, `orders_discount_total_hardening`).

## Why

About eight screens each defined "revenue" their own way. POS discounts never reached `discount_total`, so any SQL summing that column under-reported them. Payment-type totals counted unpaid money under the checkout method. Two readers stopped at PostgREST's 1,000-row cap and returned a partial day as if it were complete. Convex's period query counted an order placed exactly at midnight on two days. Before any report reads these numbers, there has to be one definition of each of them.

## What changed

| Piece | Behaviour |
|---|---|
| `src/lib/reports/money.ts` | Integer centavos. `toCents` reads Postgres numeric strings and rounds float halves correctly (1.005 → 101). `allocateCents` uses the app's bill-split rule (largest remainder), and a test fails if the two copies ever disagree. |
| `src/lib/reports/discount-allocation.ts` | Splits the stored discount into food and delivery, then by kind (senior, PWD, senior/PWD, voucher, manual, promo) using the labels the register and voucher engine write today. The kinds add up to the stored total exactly. |
| `src/lib/reports/sales-model.ts` | **The only place "net sales" is defined.** Per order it computes gross, discount, net, service, delivery, billed, collected, unpaid, overpaid and refunds, plus a line gap. It also gives lines with discounts allocated, roll-ups (item, category, channel, branch), the summary (voids, AOV = `null` with no orders, coverage) and `growthRatio` (`null` when there's no base). |
| `src/lib/reports/payment-buckets.ts` | Money actually received, per method: identified by payment-method id, else by folded name, with the label taken from the most recent name used. Split tender goes to each method, and refunds come out of the method they were paid through. **What is still owed is never put under the checkout method.** Σ buckets = collected. |
| `src/lib/reports/read/platform-order-row.ts` | Maps platform rows to report orders (pure). The discount goes through `readOrderDiscount`, and the table comes from `getOrderTableNumber`. This is the start of the Phase 1 reader. |
| `orders_sync_discount_total` (DB) | `discount_data` becomes the one stored discount: a register that only wrote the blob has it copied in (only when the blob itself changed). An edit that removes the discount also removes the blob. `discount_total` is purely derived from `discount_data.total` (no usable payload, negative or out of range = 0), so a forged value is overwritten. 120 historical rows are backfilled without firing triggers. |
| `daily-revenue-read.ts` | Pages past 1,000 rows and sums in centavos. A partial read is refused. It excludes every `REVERSED_STATUSES` order, not just `cancelled`. It still sums the order total, not net sales: that switch comes with the profit page in Phase 5, together with the 0d revenue-leak fix. |
| `daily-report-read.ts` | Movements, ingredients and units are all paged in a total order (`created_at, id`). A partial ledger is refused rather than reconciled. |
| `src/lib/convex/period-bounds.ts` + `convex-platform-aggregator.ts`, `convex-dashboard-tab.tsx`, `daily-revenue-read.ts` | `getDashboardStatsByPeriod` is inclusive at both ends, so half-open callers now pass `inclusiveEndFor(end)`: the largest double below `end`, which makes `<=` exactly `<`. `end − 1` was not enough, because `_creationTime` carries fractions of a millisecond. The deployed Convex function is unchanged: the app's callers rely on its inclusive contract (`home-period.ts`), so no Convex deploy is needed. |

### Deliberate corrections to the plan's dictionary (§5 updated)

1. **The order total is the authority, and gross is derived from it:** gross = total − service − (delivery − delivery discount) + food discount. The plan said gross = Σ line subtotals. On live data (17.5k orders over 60 days), 99.9% of orders agree. The 21 that don't are mostly edited orders whose lines or service charge went stale. Deriving gross from the total keeps "net + service + delivery = Σ total" exact. Lines are scaled to the bill and disclosed in `coverage`.
2. **Refunds are not subtracted from sales.** Every ledger `refund` row today is change returned after an edit *lowered* the bill (`webnegosyo-app/lib/order-balance.ts`), and the order's total already carries that reduction. Subtracting the refund again double-counted it: in store `acccced5` this produced ₱180.75 of phantom "overpaid". A refund is reported as money returned, and it reduces collected. Sales returned after the fact belong to the store-activity refunds ledger (Phase 6 reads it).
3. **Delivery discounts reduce the delivery fee, not food sales**, so items still add up to net exactly.
4. The `discount_total` column is now trustworthy: it is maintained by a trigger and backfilled, so SQL report RPCs may sum it. The dictionary previously said never to read it.

## RED → GREEN

1. `tests/unit/reports/money.test.ts`: RED, module missing. GREEN 7/7, including 500 random splits identical to the app's `allocateCents`.
2. `discount-allocation`, `sales-model`, `payment-buckets`, `sales-invariants`: RED, modules missing. GREEN.
   - **Rework.** After live data showed refunds were edit change-backs, the refund test was rewritten ("a refund is change handed back after an edit lowered the bill, not a second cut to sales"). The invariants changed to net + service + delivery = billed and collected − overpaid + unpaid = billed.
   - **Property suite.** 300 seeded random stores (edits, drift, split tender, refunds, tables, voids) check §10.1 invariants 1–4 and 6 to the centavo.
3. `platform-order-row.test.ts`: written together with the mapper (not test-first), 3/3.
4. `inventory-daily-revenue-read.test.ts`: RED on "reads past the 1000-row page cap" and on the Convex `endDate − 1`. GREEN 22/22.
5. `inventory-daily-report-read.test.ts`: RED on "reads the whole day past the 1000-row page cap" (2,500 movements). GREEN 15/15.
6. `convex-platform-aggregator.test.ts`: RED on current/previous `endDate − 1`. GREEN 7/7.
7. `orders-discount-total-migration.test.ts`: a shape test written alongside the migration, 7/7. The behaviour is proven by the database probes below.
8. Coverage of `src/lib/reports`: 100% statements, lines and functions; 96.75% branches.
9. Regression: 156 suites / 2,023 tests pass (reports, inventory, recipe, inventory API, activity, dashboard, aggregator). `tsc` is clean (only the pre-existing desktop `electron` errors). Lint is clean on every touched file.

## Live verification (platform DB)

### Engine vs independent SQL, to the centavo

`tests/live/sales-model-live.test.ts` reads real orders, lines and the settlement ledger through the service role (read-only; this is not an RLS test), runs the engine, checks the invariants, and compares against SQL written separately from the engine (the query is kept in the test's header contract).

| Store | Window | Orders | Net | Billed | Collected | Unpaid | Overpaid | Result |
|---|---|---|---|---|---|---|---|---|
| gungjeon-unlimited (largest, 5 branches) | 30 days | 6,565 | ₱1,601,475.97 | ₱1,683,684.82 | ₱1,599,423.68 | ₱96,451.93 | ₱12,190.79 | equal, every field |
| acccced5 (has refunds and discounts) | 90 days | 543 | ₱115,133.25 | ₱115,133.25 | ₱112,598.25 | ₱2,535.00 | ₱0.00 | equal, every field |

### Discount migration probes

All of these ran in `BEGIN … ROLLBACK` before the apply. Roles: owner `6e6a5bec` (store-wide) and branch admin `31140db3`.

| # | Actor | Action | Expected | Got |
|---|---|---|---|---|
| B1 | migration | backfill | all 124 discounted orders: column = payload | 124 / 124 |
| B2 | — | `readOrderDiscount` answer before vs after | unchanged | 0 rows differ |
| B3 | — | `updated_at` / `customer_data` on backfilled rows | untouched | 0 / 0 |
| B4 | — | activity rows written by the backfill | 0 | 0 |
| I1 | postgres | POS-style insert, blob only (PWD ₱10 + manual ₱2.50) | data and column 12.50 | 12.5, 12.50 |
| I2 | — | activity for that insert | statutory and manual split | `discount.applied` −10.00 and −2.50, `order.placed` |
| U1 | owner | forges `discount_total = 999` | overwritten | 1 row, 12.50 |
| U2 | owner | app edit re-prices to ₱5 | 5.00 | 1 row, 5.00 |
| U3 | owner | edit removes the discount | 0, blob removed, reader says none | 1 row, 0.00, blob gone, none |
| U4 | postgres | older register writes the blob only | copied, 3.00 | 3, 3.00 |
| U5/U6 | postgres | absurd (1e12) / negative total | no failure / 0 | kept / 0.00 |
| D3c | branch admin | edits own-branch order's blob | 9.99 | 1 row, 9.99 |
| D3 | branch admin | edits a no-branch order | refused by RLS | 0 rows |
| G | — | anon may call helper / staff may call trigger fn | false / false | false / false |

**Post-apply object probes:**
- the trigger exists (`BEFORE INSERT OR UPDATE OF discount_data, customer_data, discount_total`);
- the function is INVOKER with `search_path=""`;
- grants are as designed;
- 124 rows carry a payload, 0 carry it only in the blob, 0 have a mismatched column;
- 116 POS orders in 60 days now carry their discount in the column (was 0);
- sample order 511c5928 reads 35.06 / 35.06 with its original `updated_at`;
- `session_replication_role` is back to `origin`;
- no activity rows were written by the backfill.

**Advisors:** no ERRORs, and no new findings from this migration.

**Types:** not regenerated. The new SQL function has no TypeScript caller yet. Regenerating now would also pull other workstreams' live objects (e.g. store_activity) into this branch. The regeneration is done with the Phase 1 report RPCs, which need it.

## Review follow-up

Two independent reviews ran: the code reviewer looked at the engines, paging and Convex bounds, and the database reviewer looked at the migration.

**INCIDENT (database review, CRITICAL).**
- **Cause.** `orders_sync_discount_total` is SECURITY INVOKER, and part 1 revoked anon's EXECUTE on the helper it calls. Every storefront checkout INSERT (which runs as anon) would therefore have failed with 42501.
- **Why the probes missed it.** My rollback probes inserted as postgres, not as anon.
- **Exposure.** Applied 05:58:09 UTC; hotfix granting anon applied 06:00:35 UTC, so about 2.5 minutes. In that window the edge and postgres logs show **no** POST/PATCH to `/rest/v1/orders` and no permission errors except my own anon probe (06:00:29). No order was lost.
- **Verification.** An anon checkout insert, with and without a discount, now succeeds (H1–H3). A real POS order since then (06:03 UTC) carries its discount in both `discount_data` and `discount_total` (3.45).
- **Lesson** (saved to memory): probe every trigger on `orders` with `set local role anon`.

**Fixed** (database review; part 2 `orders_discount_total_hardening`; RED shape tests first, then rollback probes as anon and as branch staff):

| Finding | Fix | Probe |
|---|---|---|
| MED: a forged `discount_total` without a payload survived (e.g. anon inserting 500) | the column is purely derived: no usable payload = 0 | H2 0.00 |
| MED: a stale client writing old `customer_data` back could resurrect a removed discount | copy the blob only when `customer_data.discount` itself changed | H6 unchanged. H5 (a client re-writing the old blob itself) still re-adds it: indistinguishable from an older register adding a discount; accepted |
| LOW: 99,999,999.995 rounds to an overflow | bound `< 99999999.995`, else 0 | H3 0.00 |
| MED: did the backfill resurrect discounts an edit had removed? | checked: the 2 edited orders among the backfilled rows add up (lines − discount + service = total) | none resurrected |

**Fixed** (code review; RED first):

| Finding | Fix |
|---|---|
| MED: a ledger row with the method id but no name was labelled "Not recorded" and could overwrite a real name | it borrows the order's name for its own method; a nameless slice never replaces a real name |
| MED: `payment_status` NULL was treated as owing, unlike the app's `isOrderUnpaid` | NULL = settled (a backend with nothing to say); no platform order in either live window has NULL |
| MED: daily revenue excluded only `cancelled` | uses `REVERSED_STATUSES` |
| MED: Convex `end − 1` left a sub-millisecond gap | `inclusiveEndFor` (next double down) |
| LOW: `aovCents` could be −0 | `+ 0` |
| LOW: a ledger row with no `kind` would crash the buckets | null-safe |
| LOW: "Senior's Day" matched the senior discount | possessive excluded |

**Accepted.**
- Offset paging on a mutable filter, documented in `sumOrderTotals`; the Phase 1 RPCs aggregate in SQL.
- `truncated` at exactly `maxRows` (50k/100k rows, never reached).
- The plain `Error` thrown from `readAll`: callers only log or show the message.

**After the fixes.**
- Both live reconciliations were re-run and are still equal to the centavo.
- 166 suites / 2,102 tests pass in the touched areas.
- The full web unit run passes 1,193/1,195 suites. The two failures don't touch these changes:
  - `leads-service.test.ts` fails on a missing `SUPABASE_SERVICE_ROLE_KEY` in the test environment, a file this work never touched.
  - `cache.test.ts` failed only under load and passes alone.
- `tsc` and lint are clean.

The independent SQL treats `payment_status is null` as settled, matching the engine.

## Found, not fixed here

- **₱12,190.79 over-collected on 73 gungjeon orders in 30 days.** The ledger exceeds the bill on orders that were never edited, and 53 of them have several charge rows. These look like payments recorded twice. Reports will show an "Overpaid" figure; the cause is worth a look in the app's collect and settle flows.
- **₱96,451.93 at gungjeon is unpaid by every record.** No paid status, no ledger, and either not handed over or a table tab. This is probably dine-in tabs closed without "paid". The report shows it as Unpaid, as the dictionary requires.
- **21 orders in 60 days don't add up** (lines + service ≠ total), all of them edited orders. The edit path appears to leave `service_charge_amount` stale, or to drop it from the total (e.g. lines ₱1,015 + service ₱50.75, billed ₱1,015). Reports disclose this; the fix belongs to the order-edit owners.
- The app's and Convex's `revenueGrowth` still read 0% instead of "new" when there's no base (`analytics-compute.ts`, Convex `analytics.ts:476`). `analytics-compute.ts` has uncommitted edits by the bill-split session, so it is deferred to Phase 7 (Convex + app) to avoid a collision.
- The uncommitted split-tender slices (Convex `paymentSlices.ts`, app `analytics-payment-slices.ts`, on `feat/bill-split-tender`) still put the unpaid remainder under the checkout method. They belong to another session's uncommitted work, so they were not moved. Phase 7 points them at `payment-buckets.ts` with a parity test.
- Convex `getAllOrderItemsInternal` still takes no window (Phase 7: needs a Convex deploy).
