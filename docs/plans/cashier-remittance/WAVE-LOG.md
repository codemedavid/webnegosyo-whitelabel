# Wave log (lead)

## Wave 1 — follow-ups owed to wave 2
- shared: denomination piece cap = per key 0..100000, loose_coins_cents ≤ 10000000 (relayed to db). ExpenseKeypad still duplicates Keypad. Slip input types RemittanceSlipInput / DayCloseSlipInput live in lib/cash-slips/*.
- bizday: schedule not yet passed at — web report-context.ts:84,86,103,116; load-admin-dashboard.ts:116,118; order-stats.ts:59; app pos-sales.tsx:95,156,163 (use drawerDayWindow untilMs); dashboard.tsx:142-143; orders.tsx:167,176; ReportRangePicker.tsx:79; ReportPeriodBar.tsx:48; report-range-picker.ts:34; ActivityFilterSheet.tsx:68; PairingsView.tsx:56; product-performance/period.ts:40,43; supabase-adapter.ts:931; supabase-analytics.ts:230; offline register-pack.ts needs cutoff schedule part. Web zero-fill sites (sales-overview.tsx:104,106, profit-overview.tsx:40, sales-breakdowns.ts:191) wait for SQL day buckets (db 140000) + parity test with random schedules. TS↔SQL property test for business_day_of not written yet.
- tsc error: webnegosyo-app/components/ShiftCard.test.tsx:404 (app-cashier).
