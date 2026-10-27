# Cashier build — team contracts (read before touching code)

Approved by the owner 2026-10-26 ("approve all", every recommendation in `plan.md`), with one standing rule:
**standard, not custom.** Every behaviour must fit every store (single till, several tills, several branches,
stores that never clock in, platform / Convex / tenant-Supabase backends) through settings with safe defaults,
use industry-standard concepts (business day, shift report, cash drop/pickup, paid in/out, blind count,
remittance, day close, service periods), and contain no merchant-specific special cases.

Design of record: `research/07-architecture.md` (data/RLS), `research/06-ux-design.md` (UX, copy, states),
`mockups.html` (look). Where this file and those disagree, THIS file wins (it records decisions taken since).

## 0. Ground rules (all agents)

- Worktree: `/Users/codemedavid/Documents/whitelabel/.claude/worktrees/cashier`, branch `feat/cashier-remit`
  (stacked on `feat/expenses`, PR #88). Work ONLY here. Use absolute paths. `node_modules` are symlinks to the main
  checkout — never `npm install` (see memory "fast-check-shared-node-modules").
- Seven agents share this worktree. **Touch only files you own (§9).** If you need a change in someone else's file,
  say so in your final report — do not edit it.
- Commit your own work in small steps: `git add <explicit paths> && git commit -m "<type>: …" -- <explicit paths>`.
  Never `git add -A`/`.`, never `commit -a`, never `git stash` in any form, never rebase/reset/push. If
  `index.lock` exists, wait 2 s and retry. Conventional commit messages; end each with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Put the reasoning in code comments and
  test names, not only in the commit body.
- **Never apply migrations to the live database, never deploy, never call write MCP tools.** Read-only live SQL is
  allowed only with `set local statement_timeout = '5s'` first, bounded windows and LIMITs.
- Do not edit generated types (`src/types/supabase.ts`, `src/types/database.ts`, app equivalents). New tables/RPCs
  are reached through small typed service modules with local interfaces and ONE narrow cast; types get regenerated
  after the migrations are applied live.
- TDD: tests first. Web: `NEXT_PUBLIC_SUPABASE_URL=http://localhost NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npm run test -- --testPathPatterns=<pattern>`.
  App: `cd webnegosyo-app && npx jest <pattern>`. SQL: `node tests/sql/<runner>.cjs` (and `npm run test:sql`).
  Properties live in `*.property.test.ts` with `propertyParameters()`.
- Money is integer centavos in every new column, RPC and TS type (`*Cents`). Existing `staff_shifts` peso columns
  stay as they are.
- Copy: plain English, the words in `06-ux-design.md` §7. Never "variance", "reconciliation", "tender".
  Prints say "SHIFT REPORT" / "DAY CLOSE" and "Not an official receipt" — never "X-READING"/"Z-READING".
- Platform first (CLAUDE.md). Route through `resolveOrderBackend`; non-platform stores get a labelled fallback,
  never a silent ₱0 ("Adding up…" / "Not loaded", never 0 for unknown).

## 1. Decisions (final)

1. Business day cutoff: store-wide, effective-dated; **no row = Manila midnight** (today's behaviour). Range 00:00–11:45,
   15-min steps. A shift belongs to the business day it opened in. Stores with late orders see a one-tap suggestion.
2. Daily order number (#01) resets at the cutoff (platform trigger now; Convex with its next bundle).
3. New permission key `cash_manage` ("Cash & day close"), backfilled to every holder of `store_setup`;
   `app_user_manages_cash()` = `app_user_has_permission(t, 'cash_manage')`. Not opt-in (`permissions: null` holds it).
4. Blind count off by default. 5. Counting bills optional by default. 6. Reason required when |difference| > ₱20 (2000 c).
7. Day close may proceed with pending remittances ("Close anyway" + note); only an OPEN shift blocks it.
8. Named shifts = **service periods** (standard term in Toast/Square reporting), optional, store-wide or per branch.
   UI calls them "Shifts" ("Day shift 12 PM–8 PM"). Without them each clocked-in shift is its own report.
9. Shift sales: the cashier sees their own shift live; cash managers see every shift; blind → the cashier sees the
   receipt list and counts live, peso totals only after the drawer is counted.
10. Built stacked on PR #88 (not merged first: merging deploys to production while #88 still owes a manage-staff
    redeploy). Both merge together later, with the owner's go-ahead.

## 2. SQL objects (owner: db)

Migrations, in order (all `set lock_timeout = '3s'`, idempotent where possible, rollback notes at the bottom):

| File | Contents |
|---|---|
| `20261027120000_business_day_cutoffs.sql` | `business_day_cutoffs` + `business_day_cutoff_for/of/bounds` + `set_business_day_cutoff` (07 §2.2) |
| `20261027120100_cash_manage_permission.sql` | backfill + `app_user_manages_cash` redefinition + `app_user_has_permission` registry entry (07 §5.4) |
| `20261027120200_cash_settings.sql` | schema `cash`, `cash.tenant_order_backend`, `tenant_cash_settings`, `save_cash_settings`, `service_periods` |
| `20261027120300_staff_shift_business_day.sql` | `staff_shifts` new columns + backfill + triggers (07 §4.1) |
| `20261027121000_shift_sales.sql` | `cash.window_sales`, `report_shift_sales`, `report_period_sales` (§4) |
| later waves | 130000 expectations · 140000 report buckets/adopters/order number · 150000 activity + close RPCs · 160000 remittances · 170000 day close · 190000 alerts · 200000 cash reports |

`tenant_cash_settings` (no row = defaults below):
```
tenant_id uuid pk, blind_close bool false, require_denominations bool false,
variance_reason_from_cents int 2000, remittance_mode text 'optional' ('off'|'optional'|'required'),
require_shift_to_sell bool false, overdue_grace_minutes int 240, default_float_cents bigint null,
updated_at timestamptz, updated_by uuid, updated_by_name text
```
`save_cash_settings(p_tenant uuid, p_settings jsonb) returns jsonb` (definer, `cash_manage`; unknown keys refused; returns the saved row as the §5 JSON).

`service_periods` (named shifts):
```
id uuid pk, tenant_id uuid, outlet_id uuid null (null = every branch), name text (1–40),
starts_minutes smallint 0..1439, ends_minutes smallint 0..1439  -- ends <= starts ⇒ ends next day
sort smallint, archived_at timestamptz null, created_at, created_by
```
RLS: read = store members (branch reach); write = `cash_manage`. Archived, never deleted.

`staff_shifts` additions: `business_day date not null` (server-stamped), `is_blind bool`, `close_kind text`,
`opening_denominations jsonb`, `closing_denominations jsonb`, `closing_non_cash jsonb`,
`device_expected_cash numeric(12,2)`, `service_period_id uuid null` (picked at clock-in; the app preselects the
period whose window contains now), `variance_reason text null` (chip key, §6).

Denominations JSON (shared by SQL `cash.denominations_total_cents(jsonb)` and TS): an object
`{ "<key>": <count int ≥ 0> }` with keys
`b1000 b500 b200 b100 b50 b20 c20 c10 c5 c1 c025 c005 c001` (b = bill, c = coin; value in pesos, `025` = 25¢).
Optional `"loose_coins_cents": <int>` for coins counted by total. Unknown key / non-integer / > 100000 pieces → invalid.

## 3. Business-day TS (owner: bizday)

`src/lib/business-day/trading-day.ts` and `webnegosyo-app/lib/business-day/trading-day.ts` (text-identical except
imports; parity test). API exactly as 07 §2.3:
```ts
export interface CutoffChange { effectiveFrom: string; cutoffMinutes: number }
export type CutoffSchedule = readonly CutoffChange[]
export const MIDNIGHT_SCHEDULE: CutoffSchedule
export function parseCutoffSchedule(rows: unknown): CutoffSchedule
export function cutoffMinutesFor(schedule: CutoffSchedule, dayKey: string): number
export function tradingDayOf(iso: string, schedule: CutoffSchedule): string          // 'YYYY-MM-DD'
export function tradingDayWindow(dayKey: string, schedule: CutoffSchedule): { startIso: string; endIso: string }
export function tradingDayLengthMs(dayKey: string, schedule: CutoffSchedule): number
export function describeCutoff(cutoffMinutes: number): { label: string; example: string } // "4:00 AM", "Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday."
```
Plus `servicePeriodWindow(dayKey, period, schedule)` → `{startIso, endIso}` and `servicePeriodOf(iso, periods, schedule)`
in `…/business-day/service-periods.ts` (both twins). Read helpers: web `src/lib/business-day/read-schedule.ts`,
app `webnegosyo-app/lib/business-day/schedule-service.ts` (+ a `useTradingDay()` hook: schedule cached in the
session, midnight fallback with a visible flag `isFallback`).

## 4. Shift sales RPCs (owner: db) — the P1 deliverable's data

`cash.window_sales(p_tenant, p_from, p_to, p_outlet uuid, p_receipt_limit int) returns jsonb` — internal, built ONLY on
the existing `reporting.*` helpers behind `report_sales_summary` / `report_payments` / `report_sales_by_dimension` /
`report_sales_by_item` (one sales definition; no new revenue formula). Half-open `[p_from, p_to)`, ≤ 93 days,
plpgsql `RETURN QUERY EXECUTE`/children by `order_id = any(array(...))` style (CLAUDE.md "Sales reports"),
`statement_timeout` inside.

Public wrappers (SECURITY DEFINER, explicit checks, revoked from anon):
- `report_shift_sales(p_shift_id uuid) returns jsonb` — caller must be the shift holder or `cash_manage` with branch
  reach. Window = `[opened_at, coalesce(closed_at, now()))`, outlet = shift's outlet. If the shift is blind, open,
  and the caller is not a cash manager → money fields are `null` and `"hidden": true` (receipts keep number, time,
  type, method, status but `totalCents: null`).
- `report_period_sales(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null) returns jsonb` —
  needs `reports` (42501), same body; used for "By shift" (service periods) in Reports and the day close.
- Non-platform stores (`cash.tenant_order_backend <> 'platform'`) → `{"source":"unavailable"}`; clients then use
  their backend fallback (§5 `source: 'device'`).

Return shape (camelCase JSON; the TS `ShiftSalesReport` type mirrors it):
```
{ source: 'server'|'unavailable', hidden: boolean,
  window: { from, to }, shift?: { id, staffName, drawerName, openedAt, closedAt, businessDay, servicePeriodName },
  summary: { orders, grossCents, discountCents, netCents, serviceChargeCents, deliveryCents,
             collectedCents, unpaidCents, overpaidCents, voidCount, voidCents, refundCents } | null,
  payments:   [{ key, label, cents, count }] | null,       // payment-buckets.ts buckets
  orderTypes: [{ key, label, orders, netCents }] | null,
  channels:   [{ key, label, orders, netCents }] | null,
  items:      [{ label, quantity, netCents }] | null,      // top 50 by net
  receipts:   [{ orderId, number, placedAt, orderTypeLabel, methodLabel, totalCents, status }],  // status: 'paid'|'unpaid'|'void'|'refunded'
  receiptsTruncated: boolean, firstNumber, lastNumber }
```
`number` = the daily order number (`orders.order_number`/`order_date` as the app prints it), else a short id.

## 5. Shared TS contracts

- `webnegosyo-app/lib/cash/shift-sales.ts` + `src/lib/cash/shift-sales.ts`: `ShiftSalesReport` type, zod parser,
  `fetchShiftSales(shiftId)` / `fetchPeriodSales(window)`. Owner: app → app-cashier; web → web.
- `webnegosyo-app/lib/cash/settings.ts` + `src/lib/cash/settings.ts`: `CashSettings` (camelCase of §2 table),
  `DEFAULT_CASH_SETTINGS`, zod, `fetchCashSettings`, `saveCashSettings`. Owner: app → app-owner; web → web.
- `webnegosyo-app/lib/cash/service-periods.ts` + web twin: `ServicePeriod` type + CRUD service. Owner: app-owner / web.
- `webnegosyo-app/lib/cash/denominations.ts` + `src/lib/cash/denominations.ts` (parity test): `PH_DENOMINATIONS`
  (`{ key, cents, kind: 'bill'|'coin', label }`, order of §2), `countTotalCents(counts)`, `parseCounts`, `isValidCounts`.
  Owner: shared.
- Slip builders `webnegosyo-app/lib/cash-slips/{shift-report,remittance-slip,day-close}.ts` → text lines for the
  existing print path (follow `lib/kitchen-chit.ts`). Owner: shared.

## 6. Reason chips (keys stored in `staff_shifts.variance_reason`)

Short: `wrong_change` "Wrong sukli (change)", `unrecorded_pay_out` "Pay out not recorded", `counting_mistake`,
`customer_paid_less`, `not_sure`. Over: `customer_left_extra`, `unrecorded_pay_in`, `counting_mistake`, `not_sure`.
Lives in `webnegosyo-app/lib/cash/reasons.ts` + web twin (owner: shared).

## 7. App screens (expo-router, `webnegosyo-app/app/(main)/`)

| Route | Owner | What |
|---|---|---|
| `shift-sales.tsx?shift=<id>` (and `?from&to&period` for a past period) | app-cashier | Shift sales report (P1) |
| `end-shift.tsx?shift=<id>` | app-cashier | 4-step End shift & remit (wave 2) |
| `remittance.tsx?id=<id>` | app-cashier | slip / detail (wave 2) |
| `remittances.tsx` | app-owner | inbox (wave 2) |
| `day-close.tsx?day=<key>&outlet=<id>` | app-owner | day close (wave 3) |
| `cash-rules.tsx` | app-owner | Shift & remit rules: business day, shifts (service periods), counting, short/over, selling |

**Navigation registries** (`lib/workspaces.ts`, hubs, `SUBSCREEN_PARENTS`, `REPORTS_SECTIONS`, Manage rows,
`hubs.test.ts`) are owned by **app-owner**, who registers every route above. Existing drawer files
(`app/(main)/pos-sales.tsx`, `components/drawer/*`, `lib/shift*.ts`, `lib/drawer-*.ts`) are owned by **app-cashier**.

## 8. Web (owner: web)

- `/[tenant]/admin/cash` "Cash & remits" (sidebar: Reports group). Wave 1: Shifts tab (list by business day, row →
  shift sales sheet) + Settings card (cutoff with preview, service periods, cash rules). Map it in
  `ADMIN_SECTION_PERMISSIONS` as `cash_manage` (registry agent adds the key; web adds the section).
- Reports: "By shift" view on `/admin/reports` using `report_period_sales` windows from service periods.
- Store settings (Hours) shows the business-day cutoff row linking to the Cash settings card.

## 9. File ownership

| Agent | Owns |
|---|---|
| **db** | `supabase/migrations/20261027*`, `tests/sql/run-business-day.cjs`, `run-cash-settings.cjs`, `run-shift-sales.cjs`, later cash runners, `tests/sql/run-all.cjs` additions, `tests/unit/cash/*-sql-parity*` |
| **bizday** | `src/lib/business-day/**`, `webnegosyo-app/lib/business-day/**`, their tests; adopters: `src/lib/reports/period.ts`, `src/lib/dashboard/periods.ts`, `webnegosyo-app/lib/report-window.ts`, `lib/home-period.ts`, `lib/use-report-window.ts`, `lib/drawer-day.ts`, `lib/backends/supabase-orders.ts` (`localDayStartMs` only) |
| **app-cashier** | `webnegosyo-app/app/(main)/{pos-sales,shift-sales,end-shift,remittance}.tsx`, `components/drawer/**`, `components/shift-sales/**`, `components/end-shift/**`, `lib/shift*.ts`, `lib/drawer-{view,expectation,intake}.ts`, `lib/cash/shift-sales.ts`, `lib/cash/shift-*.ts` |
| **app-owner** | `webnegosyo-app/app/(main)/{remittances,day-close,cash-rules,cash-drawers}.tsx`, `components/cash-rules/**`, `components/remittances/**`, `components/day-close/**`, `components/ShiftStatusStrip.tsx`, `lib/cash/{settings,service-periods,remittances,day-close}.ts`, navigation registries (§7) |
| **web** | `src/app/[tenant]/admin/cash/**`, `src/components/admin/cash/**`, `src/lib/cash/**` except denominations/reasons, `src/app/actions/cash*.ts`, `src/app/api/cash/**`, reports "By shift" files, sidebar entry |
| **shared** | `webnegosyo-app/components/{Keypad,BigAmount}.tsx`, `components/cash/**` (DenominationCounter, PinPad, StepBar, VerdictCard, ReasonChips), `lib/cash/{denominations,reasons}.ts` + web twins, `lib/cash-slips/**`, their tests |
| **registry/qa** | the four staff-permission registries (`src/lib/staff-permissions.ts`, `webnegosyo-app/lib/staff-permissions.ts`, desktop copy, `supabase/functions/manage-staff/staff-core.ts`) + their parity tests, `ADMIN_SECTION_PERMISSIONS` key wiring; afterwards review + QA (read-only unless asked) |

---

# Wave 2 contracts (2026-10-27) — P2 server expected · P3 rest of business day · P4 end shift & remit · P5 remittances

Same ground rules (§0) and ownership (§9). Wave-1 follow-ups are in `WAVE-LOG.md` — each owner clears theirs.

## W2.1 Counting is locked once revealed (blind and non-blind alike)
Standard blind-count rule (Toast/Simphony): the cashier submits a count, THEN sees the result; a recount is allowed
once, and every attempt is kept. New append-only table `shift_counts(id, shift_id, tenant_id, attempt smallint 1..2,
counted_cents bigint, denominations jsonb, counted_by, counted_at)` (unique shift_id+attempt).

## W2.2 SQL (owner: db)
| File | Contents |
|---|---|
| `20261027130000_shift_expectations.sql` | `shift_expectations`, `cash.shift_expected(shift, until)` (07 §3.3), freeze trigger **SHADOW** (stores server + device; `expected_cash` unchanged). Authoritative switch is a separate later file, `130100`, gated on the live drift probe — write it, do not apply. |
| `20261027140000_business_day_reports.sql` | `report_sales_by_period/_by_hour` buckets by `business_day_of` (07 §2.5) + extend `report-sql-parity.property.test.ts` & `report-sales-worker.cjs` (load 121000 too) to random schedules; TS↔SQL property test for `business_day_of/_bounds` vs `trading-day.ts` |
| `20261027140100_business_day_adopters.sql` | `assign_daily_order_number` resets at the cutoff (order_date = business_day_of; check unique index + `supabase-order-schema.ts` copy notes for bizday), `inventory_counts.business_day` server default, `expenses` drawer `spent_on` = business_day_of |
| `20261027150000_cash_activity_and_close.sql` | activity vocabulary (07 §7.4), `count_shift`, `preview_shift_close`, `close_shift`, `force_close_shift`, stale-shift refusal in `open_shift`, blind legacy guard (RPC mark), close_kind rule |
| `20261027160000_cash_remittances.sql` | `cash_remittances` + pickups + transitions (below) |

RPCs (exact names; jsonb in/out camelCase; all money in cents):
- `open_shift(p_tenant, p_outlet, p_drawer_id, p_opening_float_cents, p_opening_denominations jsonb, p_service_period_id, p_staff_name) → {state:'opened'|'joined'|'stale', shift, handover:{previousShiftId, leftCents, staffName, closedAt}|null}` (INVOKER). `stale` = caller's open shift is past `end_at(business_day)+overdue_grace`; never joined.
- `preview_shift_close(p_shift_id) → {source:'server'|'device'|'none', hidden:boolean, expectedCents|null, breakdown|null, nonCashByMethod:[{key,label,cents,count}]|null, floatCents, isZeroBalance, countAttempts:int}` — hidden (expected null) for a non-manager on a blind shift until a count exists.
- `count_shift(p_shift_id, p_counted_cents, p_denominations jsonb, p_device_expected_cents bigint) → {attempt, countedCents, expectedCents, differenceCents, source, reasonRequired:boolean}` — attempt 1 or 2 only (third → 22023 `recount_limit`). Reveals expected AFTER the count, to the holder too.
- `close_shift(p_shift_id, p_non_cash jsonb, p_variance_reason text, p_note text, p_float_kept_cents bigint, p_remit_to uuid, p_remit_to_safe boolean, p_closed_by_name text) → {closedAt, countedCents, expectedCents, differenceCents, remittanceId|null, handedOverCents}` — uses the LAST `shift_counts` attempt (none → 22023 `count_required`); reason required when |diff| > `variance_reason_from_cents` (22023 `variance_reason_required`); CAS open→closed; creates the shift remittance (mode ≠ off).
- `force_close_shift(p_shift_id, p_note) → {closedAt, remittanceId|null}` (cash manager, not the holder; no count invented).
- Pickups: `record_cash_pickup(p_shift_id, p_amount_cents, p_taken_by uuid|null, p_to_safe boolean, p_note) → {movementId, remittanceId}` (writes `shift_cash_movements` kind `collect` + a `pickup` remittance in one txn; `shift_cash_movements` gains `taken_by`, `taken_by_name`, `to_safe`).
- `cash_remittances(id, tenant_id, outlet_id, kind 'shift'|'pickup', shift_id, movement_id null, business_day, cashier_user_id, cashier_name, handed_over_cents, remitted_to null, remitted_to_name, to_safe, status 'pending'|'accepted'|'disputed'|'resolved', received_cents, received_by, received_by_name, received_at, accept_method 'app'|'pin', is_self_received, receiver_note, dispute_reason, resolved_*, created_at)` — 07 §5.1 with `kind`/`movement_id`/`to_safe`/`accept_method` added.
- `accept_remittance(p_id, p_received_cents, p_note) → row`, `dispute_remittance(p_id, p_reason, p_received_cents)`, `resolve_remittance(p_id, p_note)` — definer, CAS, `cash_manage` + reach, not the cashier unless owner; different amount ⇒ note required.
- `accept_remittance_as(p_id, p_receiver uuid, p_received_cents, p_note) → row` — **service role only**; used by the PIN route after the PIN is verified; `accept_method='pin'`.
- `list_remittances(p_tenant, p_status text[], p_business_day date|null, p_outlet uuid|null, p_limit int)` — or plain RLS reads; db decides, documents it.

## W2.3 Web route for "PIN here now" (owner: web)
`POST /api/cash/remittances/[id]/accept-pin` body `{receiverUserId, pin, receivedCents, note?}` — bearer (app) via
`withRequestBearer` or cookie. Caller must be the remittance's cashier (at the counter) or a member at its branch;
verifies with `verify_staff_approval_pin` (service role) using the SAME Upstash limits + lockout escalation as the
Senior/PWD approver PIN routes (`src/app/api/gov-discounts/*`, `route-guards.ts`) — reuse, don't copy; receiver must
hold `cash_manage` with branch reach; then `accept_remittance_as`. Responses: 200 row · 401/403 · 423 locked
`{lockedUntil}` · 409 not pending · 422 wrong PIN `{triesLeft}`. Receivers without a PIN set → 412 "No PIN set —
send to their phone instead".

## W2.4 App (owners: app-cashier / app-owner / shared)
- app-cashier: `end-shift.tsx` 4 steps (06 §4.3) on the RPCs above; Step 1 count → `count_shift` (Recount uses attempt 2);
  Step 2 non-cash from `preview_shift_close.nonCashByMethod`; Step 3 verdict (from count_shift), reasons; Step 4
  Remit to (receivers = cash managers with branch reach — `list_cash_receivers` read, app-owner provides
  `lib/cash/receivers.ts`), "Send to their phone" | "PIN here now" (route W2.3) | Store safe; then `remittance.tsx`
  slip (print via shared builder). Start shift upgrades (06 §4.1: count mode, usual float, handover check, named shift
  picker, stale-shift close-first). MyShiftCard one-hero + blind + business-day note; CashMoveSheet Pickup "Taken by"
  → `record_cash_pickup`. Offline: steps 1–3 drafted per shift, remit refused with the designed copy; outbox must be
  empty before close on platform. Fix wave-1 period id/name + duplicate href helper. Wire `drawerDayWindow` in
  pos-sales.tsx.
- app-owner: `remittances.tsx` (To accept · Accepted · Pickups), Accept sheet (Yes / different amount / dispute),
  remittance detail (slip), owner resolve; `lib/cash/remittances.ts`, `lib/cash/receivers.ts`; Home strip variants
  (cashier + receiver, 06 §3); DrawersOverview remit status + "End for him" (force close) — DrawersOverview is in
  components/drawer (app-cashier's): app-owner builds the sheet component, app-cashier mounts it. Doors: Reports →
  Remittances, Home strip.
- shared: `RemitToPicker`, `NonCashCheck` (Matches/Different/All match/references), `AcceptRemitSheet` body,
  print wiring helpers for remittance slip; fold ExpenseKeypad onto Keypad if it can be done without touching
  expenses behaviour (expenses files: you may edit `components/expenses/ExpenseKeypad.tsx` only).
- bizday: remaining call sites in WAVE-LOG (now yours to edit even where another agent owned the file in wave 1,
  EXCEPT pos-sales.tsx which app-cashier wires), offline register-pack cutoff part, Convex `time.ts`/`orderNumber.ts`
  cutoff (code + bundle version bump per memory "convex-tenant-deploy-pipeline"; never deploy), web zero-fill sites
  once db's 140000 lands, TS copy of order-number day logic in `src/lib/supabase-order-schema.ts`.
- web: "To accept" tab + remittance sheet (accept/different/dispute/resolve) on `/admin/cash`, Shifts table remit
  status + count attempts, W2.3 route, payment `type` in parser (db: add `type` to payment buckets in shift sales if
  cheap, else web derives).
- qa: run the FULL suites + both tsc + lint on current HEAD first and report; then review wave 2 as it lands
  (especially: blind leaks via count_shift/preview/activity/slips/RLS on shift_counts & shift_expectations;
  CAS transitions per role; PIN route rate-limit reuse; offline refusals).

---

# Wave 3 contracts (2026-10-27) — P6 day close · P7 alerts · P8 cash reports · wave-2 leftovers

## W3.1 SQL (owner: db)
| File | Contents |
|---|---|
| `20261027170000_business_day_closes.sql` | `business_day_closes` (07 §5.2, versioned, frozen snapshot), `get_day_close_status`, `close_business_day`, `reopen_business_day`, `record_day_deposit`, `get_business_day_close`; closed-day guard in the `staff_shifts` BEFORE INSERT trigger + shared advisory lock with `open_shift`; activity kinds `day.closed/day.reopened/day.deposit_recorded` |
| `20261027180000_profit_business_day.sql` | profit SQL day buckets via `business_day_of` (bizday left a comment at the site) + parity |
| `20261027190000_cash_alerts.sql` | `cash.notify_overdue_shifts()` + pg_cron every 15 min; `merchant_notifications` kinds `shift_overdue`, `remittance_pending` (pending > 60 min); visibility by kind (cash kinds need `cash_manage`) in `app_user_may_read_merchant_notifications` |
| `20261027200000_report_cash_functions.sql` | `report_cash_summary(p_tenant, p_from_day, p_to_day, p_outlet)` (one row per shift incl. first vs final count) + `report_cash_by_staff` (shifts, short count, over/short total, forced closes, recount-changed count); INVOKER + `cash_manage` 42501; ≤ 93 days |

RPCs:
- `get_day_close_status(p_tenant, p_outlet, p_day date) → {businessDay, window:{start,end}, cutoffMinutes, openShifts:[{shiftId, staffName, drawerName, openedAt, overdue}], pendingRemittances:[{id, cashierName, handedOverCents, status}], nonCashUnchecked:[{shiftId, staffName, method}], existingClose:{id, version, status, closedAt, closedByName}|null, preview: <snapshot>}` — read for the checklist; cash managers only.
- `close_business_day(p_tenant, p_outlet, p_day, p_note, p_force boolean) → {id, version, snapshot}` — refuses 55000 `open_shifts` (always), 55000 `unsettled_remittances` when remittance_mode='required' and not forced; forced needs a note; 23505 already closed.
- `reopen_business_day(p_close_id, p_reason)` owner/superadmin, ≤ 31 days; `record_day_deposit(p_close_id, p_cents, p_to, p_ref, p_proof_url)` set-once.
- Snapshot shape = 07 §5.2 v1 PLUS `byServicePeriod: [{periodId, name, netCents, orders}]` + `otherHoursNetCents` (Day + Night + other = net), and `recountChanged: [{shiftId, staffName, firstCents, finalCents}]`. Sales come only from the reporting helpers (one definition).

## W3.2 Owners
- **app-owner:** `day-close.tsx` (06 §4.5: checklist with one-tap fixes, ink hero "Cash to deposit", by shift + by named shift, deposit sheet with photo via the app's existing image upload, Close / Close anyway / Reopen, print + share via shared's `printDayCloseSlip`), day-close history list, doors (Remittances footer card "Close Friday →", Home receiver strip "Friday is ready to close"), bell rows + push routing for the two new kinds in the app (`routeFromPushData`, `merchant-notifications.ts` wording), Reports → Remittances history & cashier over/short strip (14 shifts, diverging bars; phrased as a pattern, never a verdict).
- **web:** "Day closes" tab (list + detail + Close day + deposit + reopen) and "Cashiers" tab (over/short per cashier 30/90 days, recount-changed flags) on `/admin/cash` via `report_cash_*`; push wording side `merchant-notification-push.ts` + `tests/unit/merchant-notification-parity.test.ts`; print-friendly day close page `/admin/cash/day/[id]`.
- **shared:** `DepositSheet` body, `OverShortStrip` (diverging bars), `DayCloseChecklist`; add "Counted on this tablet" line to shift/remittance slips when `source==='device'`; optional amount on the dispute path of `AcceptRemitBody`.
- **app-cashier:** recount-changed flag on the slip/result ("Counted twice: ₱0 → ₱8,345"); share as image if an existing module allows, else leave; Drawer shows "Today is closed — reopen or wait until 4:00 AM" when clocking in on a closed day.
- **bizday:** `branch-period.ts` (Branches, Portfolio, staff leaderboard) on the cutoff; Convex trends + dailyStats cron on the cutoff (code + bundle bump, no deploy); then help qa.
- **qa:** review wave 2 leftovers + wave 3; final full suites; then write `docs/plans/cashier-remittance/RELEASE.md` (migration apply order with probes per role, deploy order, OTA, Convex/own-DB bulk deploy, rollback per migration, the 130100 drift-probe gate with the exact read-only SQL).
