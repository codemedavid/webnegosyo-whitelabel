# Merchant app: analytics accuracy + product/variation/add-on performance

2026-09-24. Merchant app (`webnegosyo-app/`). Reported symptom: "I pressed Yesterday and it's different from our actual sales, and it's inconsistent throughout the system."

## Root causes found

| # | Defect | Evidence | Fix |
|---|--------|----------|-----|
| 1 | **The platform API returns at most 1000 rows per request**; every analytics/stats read asked for `.limit(10000)` and summed whatever came back as the whole window. | Live probe: `menu_items?limit=5000` → `content-range: 0-999/16983`. Gungjeon: 1,083 orders in 7 days, 1,495 in 30 → the app read 1,000. | `readAllPages()` in `lib/backends/platform-client.ts` pages with `.range()` + a unique `id` tiebreaker. Applied to every analytics read, dashboard stats, `getOrders`, `getAllOrderItems`, product costs. Live re-probe: 7d → 1,083 distinct orders. |
| 2 | Report presets sent `daysBack`, which both backends read as **now − N×24h**: "7 days" started mid-afternoon 8 days ago; "Today" was the last 24 hours. Trends' bars used calendar days on the same screen. | `rollingWindow` in `supabase-analytics.ts`, `resolveWindow` in Convex `analytics.ts`. | `selectionToQueryArgs(selection, now, canBound)` sends the Manila calendar window when the backend can take one (`supportsBoundedWindow`: platform, or Convex ≥ v32). Older Convex bundles keep `daysBack` (they reject `startMs`). |
| 3 | Analytics/Trends/Home **froze "now" at mount**. Tab screens never unmount → after midnight "Yesterday" named the day before yesterday. | `useState(() => Date.now())` in analytics.tsx/trends.tsx; `useMemo(..., [])` in dashboard.tsx. | `useBusinessDayAnchor()` (moves only when the Manila day changes, no minute-by-minute refetch). |
| 4 | Home's yesterday comparison and the Drawer's "today" used the **phone's timezone**; everything else uses Manila. | `lib/home-period.ts`, `pos-sales.tsx` `startOfToday`. | Both now use `daily-report/business-day`. |
| 5 | Analytics "Orders" counted **cancelled** orders; Home/Trends/Branches did not. | `totalOrders = current.length`. | KPI shows `completedOrders`; cancelled keep their own card. |
| 6 | Branches / Portfolio / Home-branch / staff leaderboard summed **"the last 2000 (or 1000) orders"** filtered on the phone. The leaderboard refused every period once lifetime orders passed 1000. | `{ limit: ORDER_WINDOW }` with no window. | `ordersInWindowArgs(kpiFetchWindow(period), canBound)` reads exactly the period (+ trend baseline). |
| 7 | Daily report sent an exclusive end to an inclusive (`<=`) query → 1 ms overlap. | `daily-report.tsx`. | `endDate = end − 1`. |
| 8 | Convex `getAllOrderItems` kept the **oldest** 10k line items. | `ctx.db.query("orderItems").take(10000)`. | `.order("desc")`. Bundle rebuilt; **needs a Convex Deploy Schema to reach stores.** |

Definition every sales figure now shares: **orders not cancelled, sum of order `total`, Manila calendar days.** Product/item figures are line `subtotal` (before order discounts, service charge, delivery) — the Products view says so on screen.

## Product performance (new)

Performance → **Products** (default view): period chips Today / Yesterday / 7 days / 30 days, a balance-card hero, best sellers, and a store-wide **Add-ons** ranking. Tapping an item opens `product-performance/[productId]`: sales + trend + sparkline, "At a glance" sentences, **What people pick** (stacked variation mix per group, favourite badge, "no choice" remainder) and **Add-ons** (attach rate as "1 in N", units, revenue).

- Data: new platform ref `analytics:getItemSales` (`lib/backends/supabase-item-sales.ts`) — one windowed, paged, tenant- and branch-scoped read of sold lines. Convex stores join `getOrders` + `getAllOrderItems` on the device (`lib/product-performance/legacy-lines.ts`).
- Option parsing (`lib/product-performance/modifiers.ts`) reconciles three storage formats: register `variation_selections` (with price), web `variation` string + add-on labels (`"Cheese ×2"`, no price), edited/QR mixes.
- **A group is an add-on group only if optional AND multi-pick.** Required pick-several groups are the item's choice (Gungjeon sells "Unli Pork" as a ₱0.01 item whose required group carries ₱299 — treating it as an add-on made add-ons outsell items).
- Web orders never stored add-on prices; those use today's menu price and are marked **≈** with a footnote. Recorded prices are exact.
- A read that hits its cap reports partial coverage; the comparison is withheld rather than shown against a truncated baseline.

Live check (read-only, service role, 2026-09-23 Manila): Gungjeon 499 lines = ₱57,076.39 (matches SQL), 240 orders; Cribings 7d 452 lines read in 671 ms, compute 11 ms.

## Tests

- `lib/backends/platform-pagination.test.ts` (paging, cap, error mid-read, 2000-order read returns >1000)
- `lib/backends/supabase-item-sales.test.ts` (shape, tenant/window/branch scoping, uuid guard, truncation)
- `lib/report-window.test.ts` (bounded presets, `supportsBoundedWindow`, `ordersInWindowArgs`)
- `lib/home-period.test.ts` (Manila day on a UTC phone), `lib/branch-period.test.ts`, `lib/navigation.test.ts`
- `lib/product-performance/*.test.ts` (modifiers 14, aggregate, insights, period, legacy join, coverage)
- `components/performance/performance.test.tsx` (8 render tests)

App suite: 432/433 suites, 5,366 tests pass; the one failing suite (`lib/tenant-logo.test.ts`) is unmodified and fails to parse independently of this work.

## Not done / follow-ups

- **Drawer (`pos-sales.tsx`) still reads the 200 most recent orders** — a store over 200 orders/day (Gungjeon: 243) sees "history incomplete" on the shift card. Needs a shift-window read.
- Convex stores below v32 keep rolling-24h presets and can't use Yesterday/pick-a-day until redeployed (45 stores at v28).
- Web checkout still stores add-on names without prices; storing `{name, price, quantity}` would make add-on revenue exact.
- Not run on a device yet.
