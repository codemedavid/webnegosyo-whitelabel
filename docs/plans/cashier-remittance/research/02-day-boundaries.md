# 02 Day boundaries (Explore summary)
- Whole system: Manila midnight, fixed +08:00, ~40 copies. No cutoff column. tenants.timezone (NOT NULL default Asia/Manila) + outlets.timezone exist, read only by order-number trigger, src/lib/store-open-status.ts, store_activity_is_after_hours. Report SQL refuses p_tz ≠ Asia/Manila (20261014110000:511,596).
- Past-midnight hours: open-status handles close<open (store-open-status.ts:142-160,220). operating-hours.ts:111 (advance/scheduled) treats close<=open as invalid → 08-22 fallback; advance-order-utils.ts:187,240 browser clock. Hours editor gives no "next day" hint; app has no hours editor.
## A — follow cutoff (priority)
1. Day helpers: webnegosyo-app/lib/daily-report/business-day.ts:51,64; src/lib/inventory/business-day.ts; webnegosyo-app/lib/backends/supabase-orders.ts:337 localDayStartMs; convex-template/convex/time.ts:19,28 (takes offset); src/lib/dashboard/periods.ts:70
2. Drawer today: app/(main)/pos-sales.tsx:94,156-167; lib/drawer-view.ts:134
3. Daily order number: assign_daily_order_number (20260916123000:35, redefined 20260924120000:147); src/lib/supabase-order-schema.ts:150; convex/orderNumber.ts:6
4. Home today/yesterday: app lib/home-period.ts:21-30, lib/use-report-window.ts:38,46, supabase-adapter.ts:931; convex orders.ts:802; web order-stats.ts:58, orders-service.ts:495, tenant-supabase-orders-read.ts:154, load-admin-dashboard.ts:116
5. Reports: src/lib/reports/period.ts:137,141,312,330; app report-window.ts:66,116; SQL report_sales_by_period day bucket 20261014110000:516-525; sales-breakdowns.ts:207 weekday
6. Inventory daily report: inventory/page.tsx:173, daily-report-read.ts:105, daily-revenue-read.ts:220; app daily-report-service.ts:95, daily-report.tsx:209; count-session-service.ts:154 / app :180 business_day col (20260812120000:36)
7. Expenses/profit (worktree): 20261022120000:119,464; reporting.manila_day_on_or_after 20261022120300:58; :112,182; 20261022130100:66; src/lib/expenses/manila-date.ts
8. Approvals same-day/refund caps: store_activity_manila_day_start 20261012150000:303 → approvals.sql:503, approvals_hardening.sql:136,195; src/lib/approvals/rules.ts:35-40,123; app lib/approvals/refund-gate.ts:52, access.ts:50, review-model.ts:145; repeat-cancels 20261012150000:375
9. Analytics: app branch-period.ts:41, branch-kpis.ts:152, product-analytics-filters.ts:70, supabase-analytics.ts:276, analytics-compute.ts:98,142,270, product-performance/aggregate.ts:159, export/dates.ts, export/sales-export.ts:45; convex analytics.ts:265,281,558; dailyStats cron 23:59 UTC bug (snapshot covers only 00:00–07:59 Manila)
## B — stay calendar
BIR/gov sales book (src/lib/gov-discount-reports/period.ts:73-112, sales-book.ts:130,179, app gov-reports/period.ts); presell; scheduled/advance (app scheduled-orders.ts:136 uses phone tz — bug); SMS quiet hours/daily limit; AI daily usage; billing; bill due dates.
## C — optional
storefront visits; activity feed/staff day grouping; gov ID reuse "today"; order deletion ranges; Owl windows; superadmin analytics; hour-of-day charts.
Desktop + edge fns: no day logic.
Suggested model: tenants.business_day_cutoff time default 00:00; day key = date(local − cutoff).
