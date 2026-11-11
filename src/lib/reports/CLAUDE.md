# Sales numbers and sales reports: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Sales numbers: one definition (`src/lib/reports/`)

"Net sales", discounts, collected, unpaid and payment-method totals are defined ONLY in `src/lib/reports/sales-model.ts` + `payment-buckets.ts` (plan §5; `docs/testing/reports-sales-model.tdd.md`). Don't add another revenue formula.

- Money is integer centavos (`money.ts`). The order TOTAL is the authority: gross = total − service − (delivery − delivery discount) + food discount; lines are scaled to it. Σ items = Σ categories = Σ channels = Σ branches = net, exactly.
- A ledger `refund` is change returned after an edit lowered the bill — never subtract it from sales again. Unpaid money is never shown under the checkout method; over-collection is "Overpaid".
- `orders.discount_data` is the one stored discount and `discount_total` is derived from it by the `orders_sync_discount_total` trigger (POS blob copied in, removal clears both, forged values overwritten) — `20261013090000`/`090100`. That trigger is SECURITY INVOKER and runs as anon at checkout: any helper it calls must be executable by anon.
- Convex `getDashboardStatsByPeriod` is inclusive at both ends: half-open callers pass `inclusiveEndFor(end)` (`src/lib/convex/period-bounds.ts`), never `end` or `end − 1`.
- Live reconciliation: `SALES_LIVE=1 SALES_LIVE_TENANT=… SALES_LIVE_FROM=… SALES_LIVE_TO=… [SALES_LIVE_EXPECT=…] npx jest tests/live/sales-model-live.test.ts`.

## Sales reports (`/admin/reports`, platform stores)

Phase 1 of the suite (`docs/testing/reports-phase1-sales.tdd.md`). Overview at `/[tenant]/admin/reports`; breakdowns at `/admin/reports/[dim]` (`items` incl. `?view=matrix`, `categories`, `payments`, `channels`, `hours`, `branches`). Product Analytics redirects there on platform stores; Convex/tenant-DB stores keep it (reports for them = Phase 7).

- **SQL twins of the engine**: `report_sales_summary` / `_by_period` / `_by_dimension` / `_by_hour` / `_by_item` / `_by_category` / `report_payments` (`20261014110000` + `130000` + `140000` + `150000`), SECURITY INVOKER (RLS applies) + `reports` key (42501), ≤93 days, helpers in the non-exposed `reporting` schema. A change to `sales-model.ts`/`payment-buckets.ts`/`sales-breakdowns.ts` must change the SQL too — `tests/unit/reports/report-sql-parity.property.test.ts` (PGlite via `tests/sql/report-sales-worker.cjs`) fails on any centavo of drift; `report-sql-access.test.ts` pins who may call them.
- **Read through the caller's session client only** (`src/lib/reports/read/report-rpc.ts`); never a service-role client. Pages decide access/period/branch in `report-context.ts` (fails closed; a branch-locked account always reads its own branch whatever the URL says).
- **Children by `order_id = any(array(select …))`, plpgsql `RETURN QUERY EXECUTE … USING`.** A SQL-function version hash-joined all of `order_items` under RLS and took the platform DB down for 8 minutes (2026-10-14). Any live probe of a report function starts with `set local statement_timeout = '5s'` and a one-day window.
