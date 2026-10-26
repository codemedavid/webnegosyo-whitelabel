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
