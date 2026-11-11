# Admin sales reports

`/admin/reports` shows Net sales, Orders, Average order, Collected, a trend chart and a Totals ledger
for a period (default This week), with breakdowns at `/admin/reports/<dim>`. Numbers must equal the orders in
the database.

## Sub-features

- `overview` KPI tiles + Totals: gross − discounts = net; + service + delivery = billed; collected + unpaid = billed.
- `period` `?period=today|this_week|…` (NOT `preset`).
- `items` `/admin/reports/items` lists QA dishes.

## How to get to it (user POV)

- Admin sidebar → Reports → Sales; the period dropdown.

## Driving it with Playwright

Preconditions:

- Hold lifted; at least one QA order today.

- **Today.** `npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-admin" admin -g "reports"`:
  compares the `Net sales` tile for `?period=today` with Σ(total − delivery_fee − service_charge) over today's (Asia/Manila)
  non-cancelled sample-demo orders; saves `<p>-reports-today.json`, screenshots `r1`, `r2`.
- **Week by hand.** `node .claude/skills/verify-webnegosyo/bin/db.mjs read orders 'select=total,delivery_fee,discount_total,status&created_at=gte.<Monday 00:00+08 in UTC>&limit=1000'` vs the This week tiles.

## Gotchas

- Tiles round to whole pesos; compare within ₱1.
- Report functions are heavy on the shared DB: no ad-hoc RPC probes without `statement_timeout` (CLAUDE.md).
- On phone the items table is a different layout; match visible text only.
