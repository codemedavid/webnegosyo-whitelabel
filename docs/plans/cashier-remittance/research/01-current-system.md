# 01 Current system (code-explorer summary, 2026-10-26)
- Clock in: ShiftCard.tsx:223 → openShift (shift-service.ts:211). Server stamps opened_at, snapshots drawer name + zero-balance; one open per (tenant,staff) and per drawer.
- Sales attributed by customerData.pos.cashierId + source pos + window (lib/shift-drawer.ts:50). Moves: shift_cash_movements pay_in/pay_out/collect; validateCashMove client-only.
- Close: lib/shift.ts:145 expected = float + cash sales + pay_in − pay_out − collected; turnover = max(0, expected−float) or whole drawer if zero-balance; CountDrawerSheet shows expected BEFORE counting; closeShift writes closing_count, expected_cash (client), note, closed_by_name (client). Closed shifts immutable (trigger). Turnover never stored (derived in lib/staff-activity/shift-summary.ts:37).
- Close others: app_user_manages_cash (owner | perms NULL | store_setup) from DrawersOverview.
- PRINTS NOTHING for shifts. Only an Alert (describeClose).
- Owner: All drawers = open shifts only; closed history per person in Team/staff detail + web /admin/staff (staff-shift-history.tsx).
- Today = Manila midnight fixed +8 (backends/supabase-orders.ts:325 localDayStartMs, daily-report/business-day.ts). tenants.timezone exists, unused. Daily report is inventory-only.
- Desktop: no drawer code.
- DB drawer_variance flag hard-coded ≥ ₱100 (20261012150000:381).
- feat/expenses: record_drawer_expense (pay_out + expense in one txn), void_expense compensating pay_in while open.
- NONE exist: remit acceptance, blind count, denominations, X/Z, business day, cutoff, auto-close, safe drop, deposit, variance reasons/threshold settings, shift print.
## Gaps
1. Midnight-crossing shifts: Today-at-counter resets at midnight but shift window does not; web history files shift by toBusinessDayKey(openedAt).
2. ShiftCard gets `page` (latest 200 orders) not todaysSales (pos-sales.tsx:413) → >200 orders since clock-in = "can't be reconciled"; overnight shift can't be filled.
3. expected_cash client-computed and trusted.
4. Forgotten shifts never auto-close; window swallows next day's sales.
5. No receiving side for handover; no blind/denomination count.
6. Cash-manager gate reuses store_setup.
7. closed_by_name client-supplied; no corrections/reopen; unique idx per tenant+staff not per branch; expectedTurnover clamps at 0 when short of float; pesos numeric(12,2) vs centavos in expenses.
