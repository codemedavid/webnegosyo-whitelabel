# Cashier shifts, remittance and the business day — plan

Status: **awaiting owner approval** (2026-10-26). No code until approved ([[plan-before-building]]).
Visual plan + mockups: published artifact (see session); local copy `mockups.html`.
Research (7 agents): `research/01-current-system.md` … `07-architecture.md`. The engineering design of record is `research/07-architecture.md`; the UX spec of record is `research/06-ux-design.md`.

## Problem
- No remittance step exists: End shift = one typed total; no receiver, no print, expected cash computed on the tablet (client can write any `expected_cash`).
- "Today" = Manila midnight (fixed +08:00, ~40 copies). Night stores split shifts, reset order #01 mid-service.
- Live (platform DB): 35% of closed shifts cross midnight; 22 shifts open >24 h; 8.5% of counts short >₱2,000 with no pickup recorded; 3 busy stores take 15–17% of orders 00:00–06:00.

## Scope (phases)
| Phase | Deliverable |
|---|---|
| P0 | `business_day_cutoffs` (effective-dated) + `business_day_of/_bounds` SQL + `trading-day.ts` web/app twins (parity + property tests; empty schedule ≡ midnight); `tenant_cash_settings`; `cash_manage` key (4 registries + SQL, backfilled from `store_setup`); `staff_shifts.business_day` etc. |
| P1 | **Shift sales (ships first; owner request 2026-10-26: a merchant hand-counts receipts per shift, 12 PM–8 PM + 8 PM–2 AM).** Per-shift live + final report: receipts (#range), net, discounts, voids/refunds, by payment method, unpaid, order types, items, searchable receipt list (tap → view/reprint), print/share. Two lenses: "Store sales this shift" (all orders in the shift window) vs "My drawer" (money this cashier took). Optional named shifts (`shift_templates`: name + start/end) → Reports "By shift" + day close split. Numbers from the one sales definition: a definer `report_shift_sales(shift_id \| window)` gated holder-or-cash-manager (existing report RPCs need `reports`, cashiers only have `pos`); blind → cashier sees list/counts live, ₱ totals after counting. Convex stores via `getDashboardStatsByPeriod` window. |
| P2 | `cash.shift_expected` server twin of `summarizeShiftDrawer`+`reconcileShift`, `shift_expectations`, freeze trigger — shadow, live drift probe, then authoritative (P1b) |
| P3 | Cutoff setting UI (app + web) with preview + suggestion card; Drawer/Home/Reports (incl. SQL day buckets + parity)/expenses/approvals/inventory daily report/order number follow the cutoff. Calendar stays: BIR sales book, presell, scheduling, SMS, billing |
| P4 | End shift & remit 4-step flow, DenominationCounter (₱1000…25¢), non-cash check, verdict + reasons (>₱20), blind count, handover check at start, stale-shift refusal, outbox precondition, mid-shift check, shift report print |
| P5 | `cash_remittances` (CAS RPCs: accept / different amount / dispute / resolve), pickups with "Taken by", PIN-here acceptance, remittance slip, inbox |
| P6 | `business_day_closes` (versioned, frozen snapshot from the one sales definition), checklist, deposit + photo, reopen (owner), Z summary print/share |
| P7 | `shift_overdue` / `remittance_pending` notifications (bell + push, cash managers only, 3-copy parity) |
| P8 | `report_cash_*`, web `/admin/cash` "Cash & remits", app Reports → Remittances history, over/short per cashier |
| Defer | BIR-accredited X/Z, per-branch cutoff, GCash statement matching, vale↔payroll, Convex server expectation (P8), shared drawers |

## Decisions (recommendations; owner to confirm)
1. Default cutoff = midnight until owner picks; suggestion card for stores with late orders.
2. Daily order number resets at the cutoff (platform P2; Convex next bundle).
3. New permission `cash_manage` ("Cash & day close"), backfilled to store_setup holders.
4. Blind count off by default.
5. Counting bills optional by default.
6. Reason required above ₱20.
7. Day close allowed with pending remittances ("Close anyway" + note); only open shifts block.
8. Named shifts optional (owner may define Day/Night); unnamed = each clocked-in shift is its own report.
9. Cashier sees own shift sales live; owners/cash managers see all; blind → ₱ totals after count.
10. Merge PR #88 (Expenses) first, then build on top.

## Invariants
Platform Supabase first; server-computed expected on platform; never fabricate counts; record shortages, never deduct pay (Labor Code 113–115); closed = frozen; receiver discrepancies kept; not labelled BIR X/Z; money in integer centavos; RLS tested per role with affected-row asserts.
