# Cashier shift & remittance + business-day cutoff: architecture design

**Repo:** `/Users/codemedavid/Documents/whitelabel` · **Date:** 2026-10-26 · **Status:** design proposal (read-only research, nothing built)
**Rule zero (CLAUDE.md):** platform Supabase first. Every phase below is done only when it works end-to-end on `resolveOrderBackend(tenant) === 'platform'`, its migration is applied and probed on the platform project, and `src/types/database.ts` has been regenerated through the Supabase MCP.

---

## 0. Summary of decisions

| # | Decision | One-line rationale |
|---|---|---|
| D1 | The cutoff is **tenant-level, effective-dated** (`business_day_cutoffs`, one row per change). There is no per-outlet override. | A store-wide report must stay a single half-open window. Effective dating means history is never rewritten. |
| D2 | There is **one SQL definition** (`business_day_of`, `business_day_bounds`) and **one TS module** (`trading-day.ts`). The app copy is pinned by a textual-parity test, and both are pinned by a SQL↔TS property test. | Same pattern as `inventory/business-day.ts` + `daily-report/parity.test.ts`. |
| D3 | The existing calendar helper `src/lib/inventory/business-day.ts` **keeps its meaning** (Manila midnight). Trading-day is a new, separate concept. | That helper is used by billing, subscriptions, presell, the activity log and BIR-adjacent code. None of those should move with a cutoff. |
| D4 | With no cutoff rows, behaviour is **identical to today**. A property test pins it. | Zero-risk rollout, the same idea as "blank = pre-2026-10-19 look". |
| D5 | A shift belongs to the **business day it opened in**, frozen as `staff_shifts.business_day` at insert. | Cutoffs are meant to fall when the store is shut, so a shift that crosses one is an anomaly, flagged as overdue. |
| D6 | On platform stores the **expected cash is computed and frozen server-side** by a SECURITY DEFINER SQL twin of `summarizeShiftDrawer` + `reconcileShift`. It runs in shadow mode first, then becomes authoritative. Convex and tenant-Supabase stores fall back to the device figure, and the stored provenance says so. | This also closes an existing gap: the client can write any `expected_cash` today. |
| D7 | Expectations live in a **separate table** (`shift_expectations`) that only cash managers can read. The cashier can read it only when the store does not use blind close. | RLS is row-level, and cashiers can read their own `staff_shifts` rows, so blind close cannot be built on a column of that table. |
| D8 | Remittance is a **separate table** (`cash_remittances`, 1:1 with a closed shift), driven by definer RPCs with CAS transitions. | A closed `staff_shifts` row is immutable by design and that is test-pinned. A handover has a different actor, time and lifecycle. |
| D9 | Day close is a **versioned, append-only record** (`business_day_closes`) per tenant × outlet × business day. It freezes a snapshot, never blocks orders, and refuses while shifts are open or remittances are pending, unless forced with a note. | Evidence, not an accounting-period lock. |
| D10 | **Forgotten shifts are never auto-counted.** Overdue state is computed when read. A pg_cron job only raises notifications and activity rows. A manager force-closes a shift as *uncounted*. | "Never fabricate counts." |
| D11 | New permission key **`cash_manage`**, given once by backfill to every current `store_setup` holder. It is not opt-in. `app_user_manages_cash()` is redefined on top of `app_user_has_permission`. | Follows the `inventory`/`costs` carve-out out of `menu`. |
| D12 | Printing uses text builders (the `kitchen-chit.ts` precedent), **not** the receipt-layout engine. The documents are called "Shift report" and "End-of-day report", **not** BIR "X/Z-Reading". | The receipt engine is shaped around orders and parity-pinned. The platform is not BIR-accredited (no accreditation or PTU code exists), so BIR terms would overclaim. |

---

## 1. Current state (verified in code)

### 1.1 Shifts, drawers, movements

| Object | Where | Facts that matter here |
|---|---|---|
| `staff_shifts` | `20260823120000_staff_shifts.sql` | `opening_float`, `expected_cash` and `closing_count` are NUMERIC(12,2) pesos. `expected_cash` is "frozen at close, never recomputed". One open shift per `(tenant, staff)` (partial unique index). The branch must belong to the tenant (trigger). |
| Custody | `20260916150000_staff_shift_custody.sql`, redefined in `20261001120000` | `protect_staff_shift_custody()`: once `OLD.status='closed'` any change raises an exception. Custody columns are pinned. A close needs both `expected_cash` and `closing_count`. INSERT needs `pos`. |
| Server clock | `20260927120000_staff_shift_server_timestamps.sql` | For `authenticated` callers, `opened_at`, `closed_at` and `closed_by` are stamped by the server. This was a security fix against backdated windows. |
| Drawers | `20261001120000_cash_drawers.sql` | `cash_drawers` (zero-balance policy snapshotted onto the shift). `shift_cash_movements` (collect/pay_in/pay_out, append-only, open shifts only, server-stamped). `app_user_manages_cash()` = owner, `permissions IS NULL`, or `store_setup`, **with `au.tenant_id = target`**. A superadmin (NULL tenant) therefore gets **false** today. The `staff_shifts_close` policy lets the holder or a cash manager close. |
| Activity | `20261012151100_store_activity_stock_cash_triggers.sql` | `shift.opened` and `shift.closed` rows carry `expectedCash`/`closingCount` in `after` and the variance in the title ("drawer short ₱X"), with the `drawer_variance` flag. `cash.pay_in/pay_out/collected`. `store_activity_stamp_actor` on `staff_shifts.closed_by`. |
| Activity read | `20261012151500_store_activity_rpcs.sql` | **Own rows (actor = caller) are always visible.** This matters for blind close: today a cashier would see their own variance in their activity. |
| Vocabulary | `20261012150000_store_activity.sql` | `store_activity_category_of` is IMMUTABLE and referenced by `store_activity_kind_ck`. Flags and subject types are CHECK lists. |
| Approvals | `20261012160000_approvals.sql:841` | `approval_open_shift()` takes cash refunds from the requester's open drawer. |

### 1.2 App drawer arithmetic (the device computation)

- `webnegosyo-app/lib/shift-drawer.ts` → `summarizeShiftDrawer`:
  - **No ledger rows:** an order counts if `source='pos'`, it is not cancelled, `customerData.pos.cashierId` = the shift's staff, `opened_at ≤ created ≤ closed_at|now`, and the outlet matches (column `outlet_id`, else `customer_data.outlet_id`).
  - **Ledger rows exist:** only payment rows with `(recordedBy ?? cashierId) = staff` and a time inside the window count. This holds even on cancelled or online orders.
- `pos-sales.ts` → cash = `/(^|\s)(cash|cod)(\s|$)/i` on the method name ("GCash" is not cash). A pay-later POS sale with no ledger counts `amountPaid`. Centavos are rounded once.
- `shift.ts` → `reconcileShift`: expected = float + cash + pay_in − pay_out − collected. On a zero-balance drawer float kept = 0. `judgeCount`.
- `drawer-expectation.ts` → refuses with `INCOMPLETE_HISTORY_MESSAGE` when the newest-first order page does not reach back to clock-in. Busy platform stores hit this. A server computation removes the problem.
- `shift-service.ts` → direct PostgREST writes. **`openShift` joins any running shift**, so a shift forgotten yesterday would absorb today's sales. `closeShift` sends a client `expected_cash`.

### 1.3 Days and windows

- `src/lib/inventory/business-day.ts` (app copy `lib/daily-report/business-day.ts`, textual parity in `lib/daily-report/parity.test.ts`) uses a fixed +08:00 Manila midnight. It is used by `reports/period.ts`, app `report-window.ts`, `home-period.ts`, count sessions, staff shift history, **billing/subscriptions, presell calendars and the activity window**.
- `reports/period.ts`: `fullEnd = dayStartMs(range.to) + DAY_MS` and `bucketKey` shift by `MANILA_OFFSET_MS`, which assumes 24 h days. App `report-window.ts` presets use `endMs − days × DAY_MS`.
- SQL reports (`20261014110000`) accept only `p_tz = 'Asia/Manila'` and bucket on `placed_at at time zone p_tz`.
- `tenants.timezone` exists (default `Asia/Manila`) and drives `assign_daily_order_number` → `orders.order_date` (`20260916123000`). `outlets.timezone` exists but nothing reads it.
- `inventory_counts.business_day` is computed by the client (`count-session-service.ts:180`).
- PR #88 (`.claude/worktrees/expenses`) sets `expenses.spent_on` for drawer rows to `(m.created_at at time zone 'Asia/Manila')::date` (`20261022120000_expenses.sql:464`). `record_drawer_expense` is an INVOKER RPC over `shift_cash_movements`.

### 1.4 Ledger and backends

- `order_payments` is **platform only** (FK `public.orders`). It has `kind`, `amount`, `payment_method_name`, `recorded_by`, `created_at`, and indexes `(order_id, created_at)` and `(tenant_id, created_at desc)`. Orders have `orders_tenant_created_idx (tenant_id, created_at desc)`.
- Convex: the web server can read orders by window (`orders:getOrdersInternal`, used by `src/lib/dashboard/read-convex-sales.ts`). Payments are readable **only per order** (`orders:getOrderPayments`). There is no windowed payment query.
- There is no SQL twin of `resolveOrderBackend` today.

### 1.5 Gaps this feature must close (pre-existing)

1. **HIGH: the client writes `expected_cash`.** `staff_shifts_close` never checks it. A cashier can close with `expected_cash = closing_count` and the drawer reads "exact". D6 closes this for platform stores.
2. **`openShift` joins a stale shift** across days (see §4).
3. **`app_user_manages_cash` is false for superadmins** (NULL `tenant_id`). Redefining it in §5.4 fixes this, and the fix should be noted in the migration.
4. `tests/sql/run-staff-shifts.cjs` never loads `20261001120000` or the activity migrations. New runners must load the real chain.

---

## 2. Business day

### 2.1 Where the cutoff lives

**Tenant-level, effective-dated table. No per-outlet override in v1.**

| Option | Verdict |
|---|---|
| `tenants.business_day_cutoff time` (one value) | Rejected. A change would silently re-bucket every past day ("history rewritten"). `tenants` columns are also privileged-guarded and churn the storefront SELECT (see memory: storefront select drift). |
| Per-outlet override (`outlets.business_day_cutoff`) | Rejected for v1. A store-wide "Tuesday" would become a union of differently-shifted windows. Every report RPC (`p_from`, `p_to` instants), the 93-day guard and the sales-model "Σ branches = net" invariant assume one window. Can be revisited if a chain really runs a 24 h branch next to a day-only branch. |
| **Effective-dated `business_day_cutoffs`** | **Chosen.** Changes apply from a future business day only. The transition day is simply longer or shorter than 24 h. Past days keep their bounds forever. |

Timezone stays **Asia/Manila (fixed +08:00)**, matching the reports allow-list and the TS fixed offset. `set_business_day_cutoff` refuses when `tenants.timezone <> 'Asia/Manila'`, so the first non-PH tenant fails loudly instead of being mis-bucketed. These two helpers are then the only place a per-tenant timezone would have to land.

**Range:** 00:00 to 11:45 in 15-minute steps (`0..705`, `% 15 = 0`). Bars closing at 2–3 AM are covered. A "business day" that starts in the evening is refused as nonsense. Label: day D = `[D + cutoff(D), D+1 + cutoff(D+1))`, named after the calendar date it starts on, as Toast and Square do.

### 2.2 SQL (migration `20261027120000_business_day_cutoffs.sql`)

```sql
set lock_timeout = '3s';

create table if not exists public.business_day_cutoffs (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  -- First business day that STARTS at this cutoff. Day d starts at d + cutoff_for(d).
  effective_from date not null,
  cutoff_minutes smallint not null,
  set_by         uuid references auth.users(id) on delete set null,
  set_by_name    text,
  set_at         timestamptz not null default now(),
  primary key (tenant_id, effective_from),
  constraint business_day_cutoffs_minutes_ck
    check (cutoff_minutes between 0 and 705 and cutoff_minutes % 15 = 0)
);
comment on table public.business_day_cutoffs is
  'Effective-dated business-day cutoff. No row = Manila midnight (the pre-2026-10-27 day). Rows are never rewritten once their day has started.';

alter table public.business_day_cutoffs enable row level security;
-- Members of the store, including branch-locked staff (their triggers and reads need it).
-- No client write policy: only set_business_day_cutoff writes.
create policy business_day_cutoffs_read on public.business_day_cutoffs for select to authenticated
  using (exists (select 1 from public.app_users au
                  where au.user_id = auth.uid()
                    and (au.role = 'superadmin' or au.tenant_id = business_day_cutoffs.tenant_id)));

-- The cutoff in effect for the day that STARTS on calendar date p_day.
create or replace function public.business_day_cutoff_for(p_tenant uuid, p_day date)
returns interval language sql stable security definer set search_path = '' as $$
  select make_interval(mins => coalesce((
    select c.cutoff_minutes from public.business_day_cutoffs c
     where c.tenant_id = p_tenant and c.effective_from <= p_day
     order by c.effective_from desc limit 1), 0));
$$;

-- Which business day an instant belongs to.
-- Proof sketch: cutoff ∈ [0, 11:45], so start(c) ≤ c 11:45 < c+1 ≤ start(c+1),
-- and start(c−1) < c 00:00. An instant whose local date is c is therefore in c or c−1.
create or replace function public.business_day_of(p_tenant uuid, p_at timestamptz)
returns date language sql stable security definer set search_path = '' as $$
  with l as (select p_at at time zone 'Asia/Manila' as local_at)
  select case
           when l.local_at >= l.local_at::date + public.business_day_cutoff_for(p_tenant, l.local_at::date)
           then l.local_at::date
           else l.local_at::date - 1
         end
  from l;
$$;

-- Half-open [start_at, end_at) of one business day. Consecutive days tile exactly.
create or replace function public.business_day_bounds(
  p_tenant uuid, p_day date, out start_at timestamptz, out end_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select (p_day       + public.business_day_cutoff_for(p_tenant, p_day))     at time zone 'Asia/Manila',
         ((p_day + 1) + public.business_day_cutoff_for(p_tenant, p_day + 1)) at time zone 'Asia/Manila';
$$;

revoke all on function public.business_day_cutoff_for(uuid, date) from public, anon;
revoke all on function public.business_day_of(uuid, timestamptz) from public, anon;
revoke all on function public.business_day_bounds(uuid, date) from public, anon;
grant execute on function public.business_day_cutoff_for(uuid, date),
                         public.business_day_of(uuid, timestamptz),
                         public.business_day_bounds(uuid, date) to authenticated, service_role;
```

These are definer functions on purpose. They reveal only a time of day, and being definer means RLS is not evaluated per row, and the triggers that run as the cashier never trip over it. `anon` has no use for them because the storefront has no business-day concept.

**Changing the cutoff** (`set_business_day_cutoff(p_tenant, p_cutoff_minutes) returns date`):

```sql
-- SECURITY DEFINER; caller must be owner or hold `settings` (it sits beside operating hours).
v_today := public.business_day_of(p_tenant, now());
v_from  := v_today + 1;
-- If today is already closed (any branch), its END must not move: start one day later.
if exists (select 1 from public.business_day_closes d
            where d.tenant_id = p_tenant and d.business_day = v_today and d.status = 'closed') then
  v_from := v_today + 2;
end if;
-- Never move the start of a day that has already begun (a shorter cutoff could land in the past).
while (v_from + make_interval(mins => p_cutoff_minutes)) <= (now() at time zone 'Asia/Manila') loop
  v_from := v_from + 1;            -- at most twice
end loop;
insert into public.business_day_cutoffs (tenant_id, effective_from, cutoff_minutes, set_by, set_by_name)
values (p_tenant, v_from, p_cutoff_minutes, auth.uid(), public.expense_actor_name_or_staff())
on conflict (tenant_id, effective_from) do update
  set cutoff_minutes = excluded.cutoff_minutes, set_by = excluded.set_by, set_at = now();
-- A newer decision replaces any later pending one (those days have not started).
delete from public.business_day_cutoffs where tenant_id = p_tenant and effective_from > v_from;
-- + store_activity 'settings.changed' (team category, existing kind).
return v_from;
```

`expense_actor_name_or_staff()` is a placeholder for whatever actor-name helper exists when this ships.

Why this is safe: every row with `effective_from > v_today` belongs to a day that has not started. The upsert at `v_from` keeps `start(v_from) > now`, enforced by the loop. Rows before `v_from` are untouched. The UI says plainly: *"From Thursday, your business day will end at 4:00 AM. Sales after midnight will count toward the day before. Past days don't change."*

### 2.3 TS twins

- **Web:** `src/lib/business-day/trading-day.ts` (pure).
- **App:** `webnegosyo-app/lib/business-day/trading-day.ts`, text-identical apart from imports. Added to a new `lib/business-day/parity.test.ts` modelled on `lib/daily-report/parity.test.ts`.

```ts
export interface CutoffChange { effectiveFrom: string /* YYYY-MM-DD */; cutoffMinutes: number }
/** Ascending by effectiveFrom; empty = Manila midnight (identical to inventory/business-day.ts). */
export type CutoffSchedule = readonly CutoffChange[]

export const MIDNIGHT_SCHEDULE: CutoffSchedule = []
export function parseCutoffSchedule(rows: unknown): CutoffSchedule            // zod; throws on bad rows
export function cutoffMinutesFor(schedule: CutoffSchedule, dayKey: string): number
export function tradingDayOf(iso: string, schedule: CutoffSchedule): string
export function tradingDayWindow(dayKey: string, schedule: CutoffSchedule): BusinessDayWindow // {startIso, endIso}
export function tradingDayLengthMs(dayKey: string, schedule: CutoffSchedule): number          // 24h except on a transition day
```

The calendar arithmetic (`nextBusinessDayKey`, `previousBusinessDayKey`, `assertDayKey`) is imported from `inventory/business-day.ts`, so there is one source for day-key maths.

**Loading the schedule:** one tiny query per session/page. Web reads it in the `report-context.ts` path. The app reads it in the session and stores it in the offline pack.
- **Writers and freezers** (day close, cash screens) **fail closed** when the schedule cannot be read.
- **Read-only displays** (Home, Reports) use the cached schedule. If there is none, they use midnight and show a visible note: "Showing midnight-to-midnight; couldn't load your business day setting."

### 2.4 Who adopts the trading day, and what stays calendar

| Surface | Adopts trading day? | Change |
|---|---|---|
| `reports/period.ts` (web Reports) | **Yes** | `dayStartMs(key)` → `tradingDayWindow(key, s).startIso`. `fullEnd` → `dayStartMs(addDays(to,1))` (no `+ DAY_MS`). `bucketKey` for day/week/month uses `tradingDayOf`. Hour grain stays wall-clock. "Same day last week" uses `tradingDayWindow(addDays(from,−7))` cut at the same elapsed time. |
| SQL `report_sales_by_period` / `_by_hour` | **Yes** | Buckets by business day (§2.5). Parity tests extended with random schedules. |
| SQL `report_sales_summary`, `_by_dimension`, `_by_item`, `_by_category`, `report_payments` | No change | They already take instants. Only the caller's window moves. |
| App `report-window.ts` | **Yes** | `dayStartMs` via the schedule. Presets use `dayStartMs(today+1) − Σ dayLengths`, not `days × DAY_MS`. Legacy Convex `daysBack` cannot follow a cutoff (see §2.6). |
| App `home-period.ts` (Home "today/yesterday") | **Yes** | `todayRange`/`yesterdayRange` from `tradingDayWindow`. `getDashboardStatsByPeriod` already takes arbitrary inclusive ranges on both backends, so this works on every Convex bundle. |
| App Drawer day (`pos-sales.tsx`, `drawer-day.ts` `sinceMs`) | **Yes** | `sinceMs` = trading-day start. |
| Shift history (app `ShiftHistoryList`, web `staff-shift-history.tsx`) | **Yes** | Group by the stored `shift.business_day`, never re-derived. |
| Inventory count sessions (`inventory_counts.business_day`) | **Yes (P2)** | Server default `business_day_of(tenant, now())`. The client value is ignored for client roles. |
| Daily inventory report (`daily-report-read.ts`) | Yes (P2, optional) | Window via the schedule. Its stored day keys follow. |
| Expenses (#88) `spent_on` for drawer rows | **Yes** | `business_day_of(tenant, m.created_at)`, so a 1 AM ice run lands on the same day as the shift's sales. Manual expenses keep their typed date. |
| **Daily order number** (`orders.order_date`, Convex v13) | **No (v1)** | Calendar Manila. Changing it touches `assign_daily_order_number`, the unique index and a Convex bump. Open question: some bars want #01 at the cutoff. |
| **BIR sales book** (`gov_discount_claims`), VAT receipts | **No, ever** | A BIR document's date is the transaction's calendar date. |
| Store activity summary (`store_activity_manila_day_start`, approvals "same day") | No (v1) | Audit log. Calendar keeps it unambiguous. |
| Billing, subscriptions, presell dates, SMS daily limits | **No** | Not trading concepts. They keep using `inventory/business-day.ts`. |

### 2.5 SQL report buckets with a cutoff (P2, `20261027140000_report_sales_trading_day_buckets.sql`)

`report_sales_by_period`, inside its existing plpgsql body:

```sql
-- One cutoff across the whole window is the overwhelming case. That gives a constant
-- shift, so the row-level work stays a cheap expression with no per-row lookup.
select count(distinct c.cutoff_minutes) <= 1 ... into v_single;  -- cutoffs in effect over [from_day, to_day]
v_cut := public.business_day_cutoff_for(p_tenant, public.business_day_of(p_tenant, p_from));
...
case p_grain
  when 'hour'  then to_char(l.local_at, 'YYYY-MM-DD"T"HH24')        -- wall clock, unchanged
  when 'day'   then to_char(bd, 'YYYY-MM-DD')
  when 'week'  then to_char(date_trunc('week', bd), 'YYYY-MM-DD')
  else              to_char(date_trunc('month', bd), 'YYYY-MM-DD')
end
-- where bd = case when v_single then ((f.placed_at at time zone p_tz) - v_cut)::date
--                 else public.business_day_of(p_tenant, f.placed_at) end
```

The identity `((L − c)::date) = business_day_of` holds for a constant cutoff `c`, and the property test pins it. `by_hour` returns the business day's ISO weekday plus the wall-clock hour. The heatmap's hour axis starts at the cutoff. Keep the 2026-10-14 rule: any live probe starts with `set local statement_timeout = '5s'` and a one-day window. Any change to `period.ts` bucketing must ship with `report-sql-parity.property.test.ts` extended.

### 2.6 Convex and tenant-Supabase stores

- Home, Drawer and Shift screens work on every bundle, because they send instants.
- Report presets on Convex bundles below `BOUNDED_WINDOW_SCHEMA_VERSION` (32) still send `daysBack`, which cannot follow a cutoff. Those screens label the period "from midnight (this store's backend needs an update to use your 4:00 AM day)". A picked day or range already sends bounded windows.
- Convex `dailyStats` (cron 23:59 UTC) stays calendar. List the screens that read it in the release note.

### 2.7 Shifts that cross the cutoff

`staff_shifts.business_day := business_day_of(tenant, opened_at)` is stamped **by the server** at insert (BEFORE INSERT trigger, all roles; service-role imports keep a supplied value) and pinned by the custody trigger.

The cutoff is supposed to fall while the store is shut, so a shift still open past `end_at(business_day) + grace` is **overdue** (§6). Attributing a shift by the day it opened therefore only ever matters for anomalies. The sales section of the day close is windowed separately (§5), so the two never need to agree to the peso, and the end-of-day report shows both.

---

## 3. Expected cash on the server, and blind close

### 3.1 The honest position

- **Platform stores:** the database holds every order and payment row, so the expectation can be **computed and frozen server-side** by a definer function. This is the only figure no device can influence. It also removes "this screen can't reconcile" (`INCOMPLETE_HISTORY_MESSAGE`) on busy stores.
- **Convex / tenant-Supabase stores:** the orders are not in the platform DB. The register's own computation is the only figure available at close time. It is stored with `source='device'`, and the owner is told so ("Calculated on the register; can't be independently checked"). Blind close on these stores still stops the cashier counting *to* a number, which is its main purpose. It cannot stop a determined cashier who adds up their own sales, and nothing can, because a `pos` holder must read orders to ring them.
- **Later option (P8):** a Next route could compute the Convex expectation server-side through `orders:getOrdersInternal` (windowed, server key). Payments need a **new** windowed internal query (`orders:getPaymentsInWindowInternal`), which means a Convex bundle bump and a deploy to every tenant. Until that ships, device fallback is the truthful answer. `getOrderPayments` per order is N+1, and whether the deploy key can call it under `requireAccess` is unverified.

### 3.2 SQL twin of `resolveOrderBackend`

A new private schema `cash`, not exposed through PostgREST, follows the `reporting` schema precedent.

```sql
create schema if not exists cash;
revoke all on schema cash from public, anon, authenticated;

-- Twin of resolveOrderBackend (src/lib/order-backend.ts). Change both; truth-table test pins it.
create or replace function cash.tenant_order_backend(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
           when t.order_backend in ('convex','supabase','platform') then t.order_backend
           when nullif(btrim(t.convex_deployment_url), '') is not null then 'convex'
           else 'platform'
         end
  from public.tenants t where t.id = p_tenant;
$$;
```

This keeps CLAUDE.md's "route through `resolveOrderBackend`" rule: it is that rule, twinned and pinned by `tests/unit/cash/order-backend-sql-parity.test.ts`, which runs every combination of pin × URL. A platform-store cashier can never claim to be "convex" to get a device figure accepted.

### 3.3 `cash.shift_expected(shift, until)`: the twin of `summarizeShiftDrawer` + `reconcileShift`

```sql
create or replace function cash.shift_expected(p_shift public.staff_shifts, p_until timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = '' set statement_timeout = '4s'
as $$
declare
  v_staff text := p_shift.staff_user_id::text;
  v_cash_re constant text := '(^|[[:space:]])(cash|cod)([[:space:]]|$)';  -- pos-payment-methods.ts CASH_NAME
  r jsonb;
begin
  if v_staff is null then   -- removed account: match nothing (drawer-expectation.ts)
    v_staff := '';
  end if;
  with
  scoped as (   -- orders this shift could hold money for, outlet = column else customer_data.outlet_id
    select o.id, o.created_at, o.source, o.status, o.total, o.payment_method_name, o.amount_paid,
           o.customer_data -> 'pos' as pos
      from public.orders o
     where o.tenant_id = p_shift.tenant_id
       and coalesce(nullif(btrim(o.outlet_id::text), ''), nullif(btrim(o.customer_data ->> 'outlet_id'), ''))
           is not distinct from p_shift.outlet_id::text
  ),
  legacy as (   -- belongsToDrawer: no ledger rows at all
    select s.*,
           case when s.source = 'pos' and coalesce(s.pos ->> 'payLater', '') <> 'true'
                then s.total else coalesce(s.amount_paid, 0) end as settled
      from scoped s
     where s.created_at between p_shift.opened_at and p_until
       and s.source = 'pos' and s.status is distinct from 'cancelled'
       and s.pos ->> 'cashierId' = v_staff
       and not exists (select 1 from public.order_payments p where p.order_id = s.id)
  ),
  ledger as (   -- own settlement rows in the window, even on cancelled or online orders
    select p.*, s.id as sale_id
      from public.order_payments p join scoped s on s.id = p.order_id
     where p.tenant_id = p_shift.tenant_id
       and p.created_at between p_shift.opened_at and p_until
       and coalesce(p.recorded_by::text, s.pos ->> 'cashierId') = v_staff
  ),
  moves as (
    select coalesce(sum(m.amount) filter (where m.kind = 'pay_in'), 0)  as pay_in,
           coalesce(sum(m.amount) filter (where m.kind = 'pay_out'), 0) as pay_out,
           coalesce(sum(m.amount) filter (where m.kind = 'collect'), 0) as collected
      from public.shift_cash_movements m
     where m.shift_id = p_shift.id and m.created_at <= p_until
  )
  select jsonb_build_object(
    'engineVersion', 1,
    'cashSalesCents', round(100 * (
        coalesce((select sum(settled) from legacy where payment_method_name ~* v_cash_re), 0)
      + coalesce((select sum(case when kind = 'refund' then -amount else amount end)
                    from ledger where payment_method_name ~* v_cash_re), 0)))::bigint,
    'nonCashCents', ...,          -- same split, negated regex
    'nonCashByMethod', ...,       -- jsonb_agg by payment_method_name (for the tallies check, §4.3)
    'refundCents', ...,
    'saleCount', (select count(*) from legacy) + (select count(distinct sale_id) from ledger),
    'payInCents', round(100 * moves.pay_in)::bigint,
    'payOutCents', round(100 * moves.pay_out)::bigint,
    'collectedCents', round(100 * moves.collected)::bigint,
    'floatCents', round(100 * p_shift.opening_float)::bigint)
  into r from moves;
  return r || jsonb_build_object('expectedCents',
    (r->>'floatCents')::bigint + (r->>'cashSalesCents')::bigint + (r->>'payInCents')::bigint
    - (r->>'payOutCents')::bigint - (r->>'collectedCents')::bigint);
end $$;
revoke all on function cash.shift_expected(public.staff_shifts, timestamptz) from public, anon, authenticated;
```

Points to get exactly right (each one needs a generator arm in the parity property test):

- The window is **inclusive at both ends** (TS uses `>=` and `<=`).
- An order with ledger rows that are all someone else's contributes nothing.
- A pay-later order with no ledger rows counts `amount_paid`.
- **Whitespace classes.** JS `\s` includes NBSP and U+2000–U+200A, while Postgres `[[:space:]]` depends on locale for non-ASCII characters. Generate names containing those characters. If they disagree, spell the class out in SQL.
- **Rounding.** TS sums floats and rounds once. SQL is exact. With amounts ≤ 1e7 and thousands of terms, float error stays far below ½ centavo, so the two agree. The property test proves it.
- The server can be **more complete** than the device: it sees payments on orders created before the shift's page. That difference is correct. The live probe (§8.4) measures it.
- Bounded: by tenant and `created_at` (index `orders_tenant_created_idx`), by `order_payments(tenant_id, created_at desc)`, and by a 4 s timeout. The `scoped` CTE is shown inline for readability. In the real body, push the outlet predicate into each branch so the planner uses the two indexes instead of scanning the tenant's orders.

### 3.4 `shift_expectations` (frozen, provenance-stamped)

```sql
create table public.shift_expectations (
  shift_id               uuid primary key references public.staff_shifts(id) on delete restrict,
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  outlet_id              uuid references public.outlets(id) on delete restrict,
  source                 text not null check (source in ('server','device','none')),
  expected_cents         bigint,          -- NULL only when source = 'none'
  device_expected_cents  bigint,          -- what the register said, for explanations
  breakdown              jsonb not null default '{}'::jsonb,  -- cash.shift_expected() output
  engine_version         smallint not null,
  computed_at            timestamptz not null default now(),
  constraint shift_expectations_source_ck check ((source = 'none') = (expected_cents is null))
);
alter table public.shift_expectations enable row level security;
create policy shift_expectations_read on public.shift_expectations for select to authenticated
  using (app_user_may_reach_branch(tenant_id, outlet_id)
         and (app_user_manages_cash(tenant_id)
              or exists (select 1 from public.staff_shifts s
                          where s.id = shift_expectations.shift_id
                            and s.staff_user_id = auth.uid() and not s.is_blind)));
-- No client write policy: written only by the close trigger (definer).
```

### 3.5 Freezing on every close path

A BEFORE UPDATE trigger named `trg_staff_shift_zz_expectation` runs after `trg_staff_shift_stamp_times` (triggers fire in alphabetical order) so it sees the server `closed_at`. It serves both the new RPC and the legacy direct UPDATE from old app builds.

```sql
create or replace function cash.freeze_shift_expectation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_source text; v_device bigint := round(100 * NEW.expected_cash)::bigint;
begin
  if not (OLD.status = 'open' and NEW.status = 'closed') then return NEW; end if;
  NEW.close_kind := coalesce(NEW.close_kind, 'counted');
  NEW.device_expected_cash := coalesce(NEW.device_expected_cash, NEW.expected_cash);
  if cash.tenant_order_backend(NEW.tenant_id) = 'platform' then
    begin
      v := cash.shift_expected(NEW, NEW.closed_at); v_source := 'server';
    exception when others then
      raise warning 'shift expectation fell back to device: % (%)', sqlerrm, sqlstate; v := null;
    end;
  end if;
  if v is null then
    v_source := case when v_device is null then 'none' else 'device' end;
    if v_source = 'none' and not NEW.is_blind and NEW.close_kind = 'counted' then
      raise exception 'Closing a shift requires the expected cash and counted cash';
    end if;
  end if;
  insert into public.shift_expectations (shift_id, tenant_id, outlet_id, source, expected_cents,
                                         device_expected_cents, breakdown, engine_version)
  values (NEW.id, NEW.tenant_id, NEW.outlet_id, v_source,
          coalesce((v ->> 'expectedCents')::bigint, v_device), v_device, coalesce(v, '{}'), 1);
  -- P1 SHADOW: leave NEW.expected_cash as sent.
  -- P1b AUTHORITATIVE (separate migration, after the live probe):
  --   NEW.expected_cash := case when NEW.is_blind then null
  --                             else coalesce((v->>'expectedCents')::numeric / 100, NEW.expected_cash) end;
  return NEW;
end $$;
```

The custody trigger drops its "expected required" check, which moves here after the server stamp, and gains pins on `business_day` and `is_blind`. Closed-row immutability is unchanged.

### 3.6 Blind close

Owner setting `tenant_cash_settings.blind_close`.

- **Snapshotted at clock-in** onto `staff_shifts.is_blind` by the server, like `is_zero_balance` and the drawer policy. Changing the setting never alters a running shift.
- **Hidden from the cashier everywhere:**
  - App drawer card: no live expected.
  - The close sheet asks only for the count.
  - `preview_shift_close` returns `{blind:true}` to a non-manager.
  - `shift_expectations` RLS denies them.
  - `staff_shifts.expected_cash` stays NULL.
  - Activity: the cashier's own `shift.closed` row is written *without* expected or variance ("Shift closed · counted ₱4,250"). The variance goes in a separate `shift.reconciled` row with **NULL actor** and the `drawer_variance` flag. Own-row visibility then never exposes it, and only full-view accounts see it.
  - The printed shift slip leaves out expected and variance.
- **Old builds are locked out in blind stores** (they compute and show expected locally):
  - A guard in the BEFORE INSERT and BEFORE UPDATE triggers refuses `authenticated` writes to blind shifts unless the transaction carries the RPC mark (`set_config('app.shift_rpc', 'open'|'close:<id>', true)`), with the message "This store counts drawers blind. Update the app to start or end a shift."
  - This uses the same mark-and-guard pattern as PR #88's `app.expense_void`.
  - The settings toggle warns that every register needs the new build first. Precedent: `X-Voucher-Features: units`, which kept old registers off unit-limited vouchers.
- **Convex blind:** the new app still sends its silent device figure (`p_device_expected_cents`), stored as `source='device'`. The manager sees the provenance.

---

## 4. Shift close v2, denominations, stale shifts, offline

### 4.1 Migration `20261027120300_staff_shift_business_day.sql`

```sql
alter table public.staff_shifts
  add column if not exists business_day date,
  add column if not exists is_blind boolean not null default false,
  add column if not exists close_kind text,                    -- 'counted' | 'forced'
  add column if not exists closing_denominations jsonb,
  add column if not exists closing_non_cash jsonb,
  add column if not exists device_expected_cash numeric(12,2);
update public.staff_shifts set business_day = (opened_at at time zone 'Asia/Manila')::date where business_day is null;
update public.staff_shifts set close_kind = 'counted' where status = 'closed' and close_kind is null;
alter table public.staff_shifts alter column business_day set not null;
alter table public.staff_shifts add constraint staff_shifts_close_kind_ck check (
  (status = 'open' and close_kind is null)
  or (status = 'closed' and close_kind = 'counted' and closing_count is not null)
  or (status = 'closed' and close_kind = 'forced' and char_length(btrim(coalesce(note,''))) > 0));
create index if not exists idx_staff_shifts_tenant_day on public.staff_shifts (tenant_id, business_day desc);
create index if not exists idx_staff_shifts_open on public.staff_shifts (opened_at) where status = 'open';
-- trg_staff_shift_zz_business_day (BEFORE INSERT): business_day, is_blind from settings,
--   closed-day guard (§5.3), blind legacy guard (§3.6). Custody redefined (pins + forced close).
```

The backfill is correct because no cutoff existed before this migration, so the Manila date of `opened_at` was the business day.

### 4.2 RPCs (`20261027150100_shift_close_rpcs.sql`)

| RPC | Security | Behaviour |
|---|---|---|
| `open_shift(p_tenant, p_outlet, p_drawer_id, p_opening_float_cents, p_staff_name)` → `{state:'opened'|'joined'|'stale', shift}` | INVOKER (RLS + triggers apply; it adds no power) | If the caller has an open shift: `stale` when `now() > business_day_bounds(shift.business_day).end_at + grace`, else `joined`. **It never joins a stale shift.** The app then runs "Close yesterday's shift first", which is a real count of the drawer as it stands. Takes the day advisory lock (§5.3). |
| `preview_shift_close(p_shift_id)` → jsonb | DEFINER, explicit checks: open, reach, holder or cash manager | Server expectation (platform) for the live X view and the close sheet. `{blind:true}` for a non-manager on a blind shift. `{source:'device'}` hint on non-platform stores. |
| `close_shift(p_shift_id, p_counted_cents, p_denominations, p_non_cash, p_device_expected_cents, p_note, p_remit_to, p_closed_by_name)` → `{closedAt, expectation?, remittanceId?}` | INVOKER (the `staff_shifts_close` policy applies) | Validates denominations (sum = count when given; required if `require_denominations`). Sets the RPC mark and `app.remit_to`. `update … where id = $1 and status = 'open' returning` gives a CAS, and 0 rows raises `P0002 shift_not_closed`. After the trigger freezes the expectation, a non-blind store with \|variance\| ≥ `variance_reason_from_cents` and an empty note raises `22023 variance_reason_required`, rolling back. Returns the expectation only when the caller may see it. |
| `force_close_shift(p_shift_id, p_note)` | INVOKER + caller must be a cash manager **and not the holder** | `close_kind='forced'`, `closing_count NULL`, note required. Expectation frozen as normal. **No count is invented.** |

Old-build compatibility: direct INSERT and UPDATE keep working in **non-blind** stores, and every close path still freezes `shift_expectations` through the trigger.

### 4.3 Denominations and non-cash tallies

- PH values in centavos: `100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 25, 5, 1`. The ₱20 bill and ₱20 coin share key `2000`.
- Stored as `{"100000":3,"50000":2,…}`. Validated by `cash.denominations_total_cents(jsonb) returns bigint` (NULL = invalid: unknown key, non-integer count, more than 100 000 pieces), with a TS twin in `src/lib/cash/denominations.ts` plus an app copy (parity).
- `closing_non_cash`: `[{method:"GCash", declaredCents, slipCount}]`. These are what the cashier declares (card batch slips, e-wallet refs). The manager sees them next to `breakdown.nonCashByMethod`. Hidden from the cashier when blind.

### 4.4 Offline register

| Action | Offline behaviour | Why |
|---|---|---|
| Ring sales | Unchanged (offline outbox) | – |
| Open, close, force close, remit, accept, day close | **Refused** with a clear message. A typed count is kept as a local draft so the cashier never recounts. Once a count is drafted, the register shows "Drawer counted. Finish closing to sell again." | The server owns the clock (`20260927120000`). A queued close carrying a client time could narrow the window and pocket cash. A later server time with the register locked is safe. |
| Close precondition (platform) | The outbox must be empty: "Sync 3 waiting sales before ending your shift." | A sale that lands after close falls outside the window. |
| Late-arriving sales | Never rewrite the frozen expectation. The day-close snapshot lists "Sales by Ana after her shift closed: ₱340 cash". | Evidence stays frozen. *Verify:* whether `orders.created_at` on offline sync is the sync time or the ring-up time (`sync-outbox.ts` carries `createdAt`). |

---

## 5. Remittance and day close

### 5.1 Remittance: a separate table, not columns on `staff_shifts`

**Why a separate table:**
- A closed shift row is immutable. This is test-pinned in `run-staff-shifts.cjs` ("closed evidence is immutable").
- The acceptance is a different actor at a different time, with its own lifecycle (pending → accepted | disputed → resolved).
- RLS differs: the receiver acts, the cashier reads.
- It can be absent (mode `off`).
- Adding acceptance columns to `staff_shifts` would mean reopening the custody trigger for closed rows, which is the exact protection that makes the shift evidence.

**Counts stay on the shift; the handover goes on the remittance.** Denominations, non-cash tallies and the variance note describe the *count*, so they are written at close onto `staff_shifts`. `cash_remittances` holds only what moved between people.

```sql
create table public.cash_remittances (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  outlet_id          uuid references public.outlets(id) on delete restrict,
  shift_id           uuid not null unique references public.staff_shifts(id) on delete restrict,
  business_day       date not null,
  cashier_user_id    uuid references auth.users(id) on delete set null,
  cashier_name       text not null,
  handed_over_cents  bigint check (handed_over_cents between 0 and 1000000000),  -- count − float kept; NULL if force-closed
  remitted_to        uuid references auth.users(id) on delete set null,          -- advisory (who it was handed to)
  remitted_to_name   text,
  status             text not null default 'pending'
                     check (status in ('pending','accepted','disputed','resolved')),
  received_cents     bigint check (received_cents between 0 and 1000000000),
  received_by        uuid references auth.users(id) on delete set null,
  received_by_name   text,
  received_at        timestamptz,
  is_self_received   boolean not null default false,   -- owner received their own shift's cash
  receiver_note      text check (char_length(receiver_note) <= 300),
  dispute_reason     text check (char_length(dispute_reason) <= 300),
  resolved_by        uuid references auth.users(id) on delete set null,
  resolved_by_name   text, resolved_at timestamptz,
  resolution_note    text check (char_length(resolution_note) <= 300),
  created_at         timestamptz not null default now(),
  constraint cash_remittances_received_ck check ((status = 'pending') = (received_at is null)),
  constraint cash_remittances_discrepancy_note_ck check (
    status <> 'accepted' or received_cents is not distinct from handed_over_cents
    or char_length(btrim(coalesce(receiver_note, ''))) > 0),
  constraint cash_remittances_dispute_ck check (
    status not in ('disputed','resolved') or char_length(btrim(coalesce(dispute_reason, ''))) > 0),
  constraint cash_remittances_resolved_ck check ((status = 'resolved') = (resolved_at is not null))
);
create index on public.cash_remittances (tenant_id, business_day desc);
create index on public.cash_remittances (tenant_id, status) where status in ('pending','disputed');
alter table public.cash_remittances enable row level security;
create policy cash_remittances_read on public.cash_remittances for select to authenticated
  using (app_user_may_reach_branch(tenant_id, outlet_id)
         and (cashier_user_id = auth.uid() or remitted_to = auth.uid() or app_user_manages_cash(tenant_id)));
-- No client INSERT/UPDATE/DELETE policies: the state machine below is the only writer.
```

**Creation.** A definer AFTER UPDATE OF status trigger on `staff_shifts` fires when a shift closes in a store whose `remittance_mode` is not `off`. It inserts a `pending` row: `handed_over = closing_count − (is_zero_balance ? 0 : opening_float)` in cents, or NULL for a forced close, and `remitted_to` from `app.remit_to` when it is a valid uuid. Legacy closes get `remitted_to = NULL` ("Safe / any manager").

**Transitions** (definer RPCs, each a CAS `update … where id = $1 and status = '<from>' returning`, with 0 rows raising `P0002 remittance_not_pending`):

| RPC | Who | From → to | Rules |
|---|---|---|---|
| `accept_remittance(id, received_cents, note)` | `cash_manage` + reach. Not the cashier, unless owner (then `is_self_received`). | pending → accepted | Received differs from handed over → note required, `remittance_discrepancy` flag. For a forced close: received is the manager's count, labelled "counted by the receiver". |
| `dispute_remittance(id, reason, received_cents?)` | same | pending → disputed | "Envelope short / missing". Flagged. |
| `resolve_remittance(id, note)` | owner, or a `cash_manage` holder who is not the cashier | disputed → resolved | Note required. |

`remittance_mode = 'required'` means the day close refuses pending ones (§5.3). `optional` means they show but do not block.

### 5.2 Day close record (`20261027170000_business_day_closes.sql`)

```sql
create table public.business_day_closes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  outlet_id        uuid references public.outlets(id) on delete restrict,   -- NULL = store without branches
  business_day     date not null,
  version          smallint not null default 1,
  status           text not null default 'closed' check (status in ('closed','reopened')),
  window_start     timestamptz not null,        -- business_day_bounds at close time
  window_end       timestamptz not null,
  snapshot         jsonb not null,              -- frozen totals (below)
  snapshot_version smallint not null,
  sales_source     text not null check (sales_source in ('platform_sql','drawers_only')),
  forced_shift_ids uuid[] not null default '{}',
  unsettled_remittance_ids uuid[] not null default '{}',
  note             text check (char_length(note) <= 500),
  closed_by        uuid references auth.users(id) on delete set null,
  closed_by_name   text not null,
  closed_at        timestamptz not null default now(),
  -- deposit: set once, may come the next morning
  deposit_cents    bigint check (deposit_cents between 0 and 10000000000),
  deposit_to       text check (char_length(deposit_to) <= 80),     -- "BDO savings", "Safe"
  deposit_ref      text check (char_length(deposit_ref) <= 80),
  deposit_proof_url text,                                         -- validated image host, like payment proofs
  deposit_recorded_by uuid references auth.users(id) on delete set null,
  deposit_recorded_at timestamptz,
  reopened_by      uuid references auth.users(id) on delete set null,
  reopened_by_name text, reopened_at timestamptz,
  reopen_reason    text check (char_length(reopen_reason) <= 300),
  constraint business_day_closes_reopen_ck check ((status = 'reopened') = (reopened_at is not null)),
  constraint business_day_closes_window_ck check (window_end > window_start)
);
create unique index business_day_closes_live
  on public.business_day_closes (tenant_id, coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), business_day)
  where status = 'closed';
create unique index business_day_closes_version
  on public.business_day_closes (tenant_id, coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), business_day, version);
alter table public.business_day_closes enable row level security;
create policy business_day_closes_read on public.business_day_closes for select to authenticated
  using (app_user_may_reach_branch(tenant_id, outlet_id) and app_user_manages_cash(tenant_id));
-- Writes only through the RPCs below.
```

**Snapshot (`snapshot_version = 1`):**

```json
{
  "window": { "start": "…", "end": "…", "cutoffMinutes": 240 },
  "sales": {
    "netCents": 0, "orders": 0, "discountCents": 0,
    "collectedByMethod": [{"bucket":"Cash","cents":0}],
    "unpaidCents": 0, "overpaidCents": 0
  },
  "drawers": {
    "shifts": [{"shiftId":"…","staff":"Ana","drawer":"Cashier 1","closeKind":"counted",
                "floatCents":0,"cashSalesCents":0,"payInCents":0,"payOutCents":0,"collectedCents":0,
                "expectedCents":0,"expectedSource":"server","countedCents":0,"varianceCents":0,
                "remittance":{"status":"accepted","handedOverCents":0,"receivedCents":0}}],
    "totals": {"expectedCents":0,"countedCents":0,"varianceCents":0,"handedOverCents":0,
               "receivedCents":0,"collectedMidShiftCents":0}
  },
  "cashToAccountForCents": 0,
  "expenses": { "drawerCents": 0, "otherCents": 0 },
  "lateSales": { "count": 0, "cashCents": 0 },
  "unattributedCounterCashCents": 0
}
```

- **Sales come from the one definition only.** On platform, the close function calls the internal `reporting.*` helpers behind `report_sales_summary` and `report_payments` over `[window_start, window_end)` for the outlet. Those are the SQL twins of `sales-model.ts` and `payment-buckets.ts`. There is no new revenue formula. On Convex and tenant-Supabase stores, `sales_source = 'drawers_only'`: the snapshot carries the drawer section and the note "Full sales figures for this store come with Reports Phase 7."
- **"Cash collected (sales model)" and "cash in drawers" are different questions.** COD collected by riders and online cash are not in any drawer. The report labels both and never merges them.
- `cashToAccountForCents` = Σ received (or handed over when not yet received) + Σ mid-shift `collect` movements. The deposit is compared with this. The remainder is shown as "kept as cash on hand".
- **Masking:** a caller without `reports` sees the drawer section and a masked sales section (read RPC `get_business_day_close`). "A screen showing money checks the money key."

### 5.3 Guards, locks, freezes, reopen

`close_business_day(p_tenant, p_outlet, p_day, p_note, p_force boolean)` is DEFINER with explicit checks: `cash_manage`, reach to `p_outlet`, and `p_day ≤ business_day_of(now)`.

1. `perform pg_advisory_xact_lock(hashtextextended('bday:'||p_tenant||':'||coalesce(p_outlet::text,'-')||':'||p_day, 0))`. The BEFORE INSERT trigger on `staff_shifts` takes the **same lock** for its own `(tenant, outlet, business_day)`, which closes the "clock-in while the day closes" race.
2. **Open shifts** with `business_day = p_day` at the outlet → `55000 open_shifts` with the list. Day close **never closes shifts itself**. The UI offers *Force close* per shift (`force_close_shift`, note required), which keeps a single shift-closing path. Forced shifts are recorded in `forced_shift_ids`.
3. **Pending or disputed remittances** in `required` mode → `55000 unsettled_remittances`, unless `p_force` with a note → `unsettled_remittance_ids`.
4. An existing live close → `23505` (partial unique index).
5. Build the snapshot and insert `version = max + 1`. Activity row `day.closed`.

**What a close freezes:**
- No new shift may open into a closed day. The trigger refuses with "Today's business day is closed. Reopen it, or wait until 4:00 AM." This matters for early closes.
- Cash movements are already blocked, because every shift of the day is closed.
- **Orders are never blocked.** Storefront and Convex orders are not ours to refuse. The end-of-day page compares live totals with the snapshot: "₱1,240 of sales since this day was closed."
- Expenses dated D that are not from the drawer may still be filed, shown as "after close". This is evidence, not a period lock. A real books lock is a later accounting feature.
- Remittances flagged as unsettled may still be accepted later, with an activity row "after day close".

**`reopen_business_day(p_close_id, p_reason)`:**
- Owner or superadmin only in v1 (open question: branch managers).
- Only within 31 days.
- CAS `closed → reopened`, reason required, `day.reopened` activity with the `day_reopened` flag.
- Reopening does **not** reopen shifts: their expectations stay frozen. A re-close writes version + 1 with a fresh snapshot, and the old one is kept.

**`record_day_deposit(p_close_id, cents, to, ref, proof_url)`:** `cash_manage` + reach, set-once CAS (`where deposit_recorded_at is null and status = 'closed'`). When PR #88's "Bank deposit" pay-out kind is used, its id can be linked in a later iteration.

**Entry point:** both apps call `POST /api/cash/day-close` (cookie session, or `withRequestBearer` for the app, the same pattern as the assistant routes). The route checks the caller and calls the RPC through the **caller's session client**. Platform stores need nothing else. For Convex stores the route adds only drawer data, which lives on platform anyway. The route exists so that P8's server-side Convex sales read can drop in later without an app change.

### 5.4 Permission key `cash_manage`

- **Registry** (four copies plus SQL): `src/lib/staff-permissions.ts` (source of truth), `webnegosyo-app/lib/staff-permissions.ts`, the desktop copy, and `supabase/functions/manage-staff/staff-core.ts` (redeploy).
  - Label "Cash & Day Close". Description: "Set up drawers, pick up cash, close others' shifts, receive remittances, close the business day. Grant sparingly."
  - Not opt-in: `permissions: null` holds it, as it holds cash management today.
- **Backfill** (`20261027120100_cash_manage_permission.sql`): add `'cash_manage'` to every `app_users.permissions` that contains `store_setup`. This follows the `inventory`/`costs` backfill (`20261013120100`). It is **not** `IMPLIED_BY`, so an owner can later separate branding from cash. Production rejects unknown keys, so the backfill ships **with** the web, edge-function and app builds that know the key.
- **Redefinition:**

  ```sql
  create or replace function public.app_user_manages_cash(target_tenant_id uuid) returns boolean
  language sql stable security invoker set search_path = '' as $$
    select public.app_user_has_permission(target_tenant_id, 'cash_manage');
  $$;
  ```

  This fixes the superadmin false-negative (gap §1.5-3). Every existing cash policy keeps calling this one function.
- App `canManageCash` → `hasPermission(user, 'cash_manage')`. `ADMIN_SECTION_PERMISSIONS['cash'] = 'cash_manage'`, covered by the guardrail test that walks `src/app/[tenant]/admin`.
- **Coordination:** land after PR #88 (which adds `expenses`). Follow the memory "staff permission registry coordination": merge the live `app_user_has_permission` body and the deployed edge function first.
- **Cutoff setting:** owner or `settings` (it sits beside operating hours). Not `cash_manage`, because it moves every report.

---

## 6. Forgotten shifts

| Option | Verdict |
|---|---|
| Auto-close and auto-count at cutoff | **Rejected.** It fabricates a count. |
| Auto-close as *uncounted* after N hours | **Not in v1.** The stale-join refusal (§4.2) already fixes the real harm, which was today's sales landing in yesterday's shift. Can be added later as an owner opt-in `close_kind = 'auto'` with the window ending at the cutoff, never at `now()`. |
| **Lazy-on-read overdue state** | **Chosen for state.** `overdue_at = business_day_bounds(business_day).end_at + overdue_grace_minutes`, computed by `preview_shift_close`, the drawer board, Home and day close. Nothing is stored, so nothing can drift. |
| **pg_cron notifier** (pg_cron is already in use, `20260924130000`) | **Chosen for alerts** (P6). |

The notifier (`20261027190000_overdue_shift_alerts.sql`) runs every 15 minutes, `cash.notify_overdue_shifts()`, definer:
- Scans `staff_shifts where status = 'open' and opened_at < now() - interval '12 hours'`, using the partial index `idx_staff_shifts_open`. This is cheap across tenants.
- Keeps the shifts whose `overdue_at < now()`.
- Writes `store_activity` `shift.overdue` (NULL actor, `shift_overdue` flag, `event_key 'staff_shifts:<id>:overdue'`; the unique key dedupes).
- Writes `merchant_notifications` kind `shift_overdue`, and `remittance_pending` for the `remitted_to` user after 1 h.

New notification kinds need:
- the `kind` check constraint (currently an unnamed `check (kind in ('stock_low','stock_out'))`, so look up its name before altering it);
- the trigger or writer;
- wording on both sides (`merchant-notification-push.ts` and the app's `merchant-notifications.ts`);
- a route in `routeFromPushData`;
- **a visibility rule by kind**. Today `app_user_may_read_merchant_notifications` is built around stock (`menu`). Cash kinds need `cash_manage`. All three copies change together under `merchant-notification-parity.test.ts`.

This is the largest cross-cutting change, which is why it is its own phase.

---

## 7. RLS, functions, activity, Convex parity, reports, printing

### 7.1 RLS by role

| Table | anon | Cashier (`pos`) | Cash manager (`cash_manage`, store-wide) | Branch-locked manager | Owner | Service role |
|---|---|---|---|---|---|---|
| `business_day_cutoffs` | none | read | read | read | read; write via RPC (also `settings`) | all |
| `tenant_cash_settings` | none | read | read + update (policy: `app_user_manages_cash`) | read | read + update | all |
| `staff_shifts` | none | own open/close (existing). Blind: RPC only | close any reachable; force close | own branch only (`app_user_may_reach_branch`; the NULL-outlet pool is store-wide only) | all branches | all |
| `shift_expectations` | none | own, **unless blind** | reachable | own branch | all | written by trigger |
| `cash_remittances` | none | read own | read reachable; transitions via RPC | own branch | all + resolve | all |
| `business_day_closes` | none | none | read reachable; close and deposit via RPC | own branch | all + reopen | all |

- Note: neither `staff_shifts` nor `inventory_*` has a superadmin arm in `app_user_may_reach_branch`. The new tables follow `staff_shifts` (no superadmin read). Impersonation support is an open question.
- **Every PGlite runner asserts affected rows per role.** RLS refusals are silent (zero rows), so "no error" is never accepted.

### 7.2 Definer vs invoker

- **INVOKER** (adds no power; RLS and guards apply): `open_shift`, `close_shift`, `force_close_shift`, `report_cash_*`, `app_user_manages_cash`.
- **DEFINER** (explicit `auth.uid()` checks; `search_path = ''`; revoked from `public` and `anon`):
  - `business_day_*` helpers (non-sensitive, no per-row RLS cost);
  - `set_business_day_cutoff`, `preview_shift_close`;
  - remittance and day-close RPCs (no client write policies exist, so these are the state machine);
  - `cash.*` internals, revoked from `authenticated` as well;
  - activity capture and the notifier.
- **Definer caveat:** inside a definer function `current_user` is the owner, so `stamp_staff_shift_times` skips. This is one more reason day close never updates shifts itself.

### 7.3 CAS transitions

| Object | Transition | Mechanism |
|---|---|---|
| Shift | open → closed | `where status = 'open'` + row count, plus the existing policy |
| Remittance | pending → accepted \| disputed → resolved | per-RPC `where status = …` |
| Day close | closed → reopened | CAS; the live uniqueness is the partial index |
| Deposit | set once | `where deposit_recorded_at is null` |
| Cutoff | upsert rules | §2.2 |

### 7.4 Store Activity (`20261027150000_cash_activity_vocabulary.sql`, before any writer)

- `store_activity_category_of` (IMMUTABLE, `create or replace`; existing rows are not re-checked) gains, under `cash`: `cash.remitted`, `cash.remittance_accepted`, `cash.remittance_disputed`, `cash.remittance_resolved`, `shift.reconciled`, `shift.overdue`, `day.closed`, `day.reopened`, `day.deposit_recorded`. Cutoff and cash-settings changes reuse `settings.changed` (team).
- Flags `store_activity_flags_ck` (drop, re-add `NOT VALID`, then `VALIDATE`): add `remittance_discrepancy`, `forced_close`, `shift_overdue`, `day_reopened`, `late_sales`.
- Subject types: add `remittance`, `day_close`.
- Blind-aware rewrite of `store_activity_capture_staff_shift`:
  - for blind shifts, no `expectedCash` and no variance in the cashier-actor row, plus a separate NULL-actor `shift.reconciled` row carrying `drawer_variance`;
  - a forced close gets the title "Shift force-closed by Mara · drawer not counted" and the `forced_close` flag.
- TS mirrors: `src/lib/activity/taxonomy.ts` (`cash` list), `describe.ts`, `dto.ts`, with the existing vocabulary tests extended. Capture functions keep the `exception when others → raise warning` style so activity never fails a cash write.

### 7.5 Convex-store parity

| Capability | Platform | Convex / tenant Supabase |
|---|---|---|
| Shifts, drawers, movements, remittances, day close records | platform DB | platform DB (shifts are already platform for every tenant) |
| Expected cash | **server**, frozen | device, frozen, `source = 'device'`. P8: server through a new Convex internal query |
| Blind close | full | UI-blind with a device figure (labelled) |
| Day-close sales section | `platform_sql` from the sales SQL twins | `drawers_only` until Reports Phase 7 |
| Trading-day windows | everywhere | Home, Drawer, picked ranges: yes. Legacy `daysBack` presets on bundles below v32 and `dailyStats`: calendar (labelled) |

### 7.6 Reports (`20261027200000_report_cash_functions.sql`)

- `report_cash_summary(p_tenant, p_from_day date, p_to_day date, p_outlet uuid default null)`:
  - SECURITY INVOKER (RLS applies) plus `cash_manage` (42501), at most 93 days, helpers in the `cash` schema.
  - Returns one row per shift: day, staff, drawer, close kind, float, expected and source, counted, variance, remittance status, handed over, received, discrepancy.
  - `report_cash_by_staff` adds over/short totals, number of short shifts, and forced closes.
  - Small tables, indexed by `(tenant_id, business_day)`.
- Web: `/[tenant]/admin/reports/cash`, a new page next to the `[dim]` set, gated by `cash_manage` and not `reports`, because over/short is staff performance. Includes:
  - over/short by person, drawer and day;
  - open disputes;
  - deposits against cash to account for;
  - a list of day closes with a "sales changed since close" badge.
- App: Reports → "Dig deeper" (`REPORTS_SECTIONS`), "Cash & day close", when `canManageCash`.
- Optional later: an Owl read tool `get_cash_summary` (facts only, ids scrubbed). There are no write tools for cash.

### 7.7 Printing

- New pure builders, following `kitchen-chit.ts` (text → `PrintSegment[]` → `printForRole('cashier')`), in `webnegosyo-app/lib/cash-slips/`:
  - `shift-slip.ts`: the mid-shift X view and the close slip. Blind leaves out expected and variance.
  - `remittance-slip.ts`: a cashier copy and a receiver copy, with signature lines "Remitted by / Received by", amount and time.
  - `day-close-slip.ts`.
  - Paper width comes from the printer registry (`printerWidthType`: 32 or 48 columns).
- Not the receipt-layout engine: it is shaped around orders and pinned across web and app (`receipt-layout-parity.test.ts`). Adding non-order documents there would couple unrelated changes.
- **Naming:** headers say "SHIFT REPORT" and "END-OF-DAY REPORT", with "Not an official receipt." Never "X-READING" or "Z-READING", which in the Philippines mean BIR-accredited POS readings with non-resettable grand totals, and nothing in the codebase is accredited.
- Web: a print-friendly `/admin/reports/cash/day/[id]` page (`window.print()`).

---

## 8. Phased build order, migrations, tests

### 8.1 Phases (each ends with: migration applied on platform + objects probed + types regenerated via MCP + RLS asserted per role)

| Phase | Scope | Exit criterion |
|---|---|---|
| **P0 Foundations** (no visible change) | Cutoffs table + helpers + TS twins (web + app); `cash` schema, `tenant_order_backend` twin, `tenant_cash_settings`; `staff_shifts.business_day` and the other columns + backfill; `cash_manage` key + backfill + `app_user_manages_cash` redefinition (after #88). | Midnight schedule ≡ today (property). All registries are in parity. No tenant has a cutoff row. |
| **P1 Server expectation (shadow)** | `shift_expectations`, `cash.shift_expected`, freeze trigger in **shadow**. Live probe compares server and device across real closed shifts. | Drift explained (server more complete). Then **P1b**: authoritative, which closes the "client writes expected" gap. |
| **P2 Trading day adoption** | Cutoff settings UI (web Settings → Hours; app Manage → Store hours); Home, Drawer, report windows (`period.ts`, `report-window.ts`), shift history by `business_day`; SQL buckets + parity; count sessions; #88 `spent_on`. | A store with a 4 AM cutoff sees one day everywhere. Sales parity holds to the centavo. |
| **P3 Close v2** | Activity vocabulary; `open_shift`/`preview_shift_close`/`close_shift`/`force_close_shift`; denominations and tallies; stale-shift refusal; outbox precondition; blind close (setting + guards + UI); shift slip. | A blind store refuses old builds. The cashier never reads expected anywhere (RLS + activity + slip). |
| **P4 Remittance** | Table, trigger, RPCs; cashier "Hand over" step; manager inbox (accept, dispute, resolve); remittance slip; activity. | Every transition is CAS-tested per role. A colleague's attempt returns 0 rows or 42501. |
| **P5 Day close** | Table, RPCs, `/api/cash/day-close`; web and app screens; deposit + proof; reopen (owner); late-sales and since-close indicators; end-of-day slip. | Refusals (open shifts, unsettled remittances, closed-day clock-in) and advisory-lock race tests pass on PGlite. Live dry run on the demo store. |
| **P6 Overdue alerts** | Notifier + pg_cron; `shift_overdue` and `remittance_pending` notification kinds; visibility by kind in three places. | Notification parity test green. A push reaches only cash managers. |
| **P7 Reports** | `report_cash_*` + `/admin/reports/cash` + app section. | 93-day cap, key check, branch-locked caller reads only their branch. |
| **P8 (optional)** | Convex server-side expectation (new internal windowed payments query, bundle bump) and a Convex day-close sales section (with Reports Phase 7). | Convex `source` becomes `'server'`. |

### 8.2 Migration list (all dated 2026-10-27, applied in this order)

| File | Phase |
|---|---|
| `20261027120000_business_day_cutoffs.sql`: table, `business_day_cutoff_for`/`_of`/`_bounds`, `set_business_day_cutoff`, RLS, grants | P0 |
| `20261027120100_cash_manage_permission.sql`: backfill + `app_user_manages_cash` on top of `app_user_has_permission` (ships with code that knows the key) | P0 |
| `20261027120200_cash_schema_and_settings.sql`: `cash` schema, `cash.tenant_order_backend`, `tenant_cash_settings`, `cash.settings_of()` | P0 |
| `20261027120300_staff_shift_business_day.sql`: columns, backfill, constraints, indexes, `zz_business_day` trigger, custody redefinition | P0 |
| `20261027130000_shift_expectations_shadow.sql`: table, `cash.shift_expected`, freeze trigger (shadow) | P1 |
| `20261027130100_shift_expectations_authoritative.sql`: freeze writes the server value into `expected_cash` (applied **only** after the live probe) | P1b |
| `20261027140000_report_sales_trading_day_buckets.sql`: `report_sales_by_period` / `_by_hour` business-day buckets | P2 |
| `20261027140100_business_day_adopters.sql`: `inventory_counts.business_day` server default; #88 `expenses_drawer_link` uses `business_day_of` (only if #88 has merged) | P2 |
| `20261027150000_cash_activity_vocabulary.sql`: kinds, flags, subject types, blind-aware shift capture | P3 |
| `20261027150100_shift_close_rpcs.sql`: `open_shift`, `preview_shift_close`, `close_shift`, `force_close_shift`, blind and closed-day guards, `cash.denominations_total_cents` | P3 |
| `20261027160000_cash_remittances.sql`: table, creation trigger, RPCs, activity capture | P4 |
| `20261027170000_business_day_closes.sql`: table, `close_business_day`, `reopen_business_day`, `record_day_deposit`, `get_business_day_close`, snapshot builder, activity | P5 |
| `20261027190000_overdue_shift_alerts.sql`: notifier, pg_cron, notification kinds, visibility by kind | P6 |
| `20261027200000_report_cash_functions.sql`: `report_cash_summary`, `report_cash_by_staff` | P7 |

Every migration starts with `set lock_timeout = '3s'` (hot tables), includes a rollback block, and is followed by probes for the objects it creates (columns, functions, policies, triggers), not just a check of the migration name.

### 8.3 Tests

**PGlite SQL runners** (`tests/sql/`, built on `lib/platform-auth.cjs` and `lib/platform-orders-stub.cjs`, running the **real** migration chain, including `20261001120000` and the activity files, and asserting affected rows per role):
- `run-business-day.cjs`: helpers on fixed cases (midnight, 03:59/04:00, transition days longer and shorter than 24 h); the `set_business_day_cutoff` effective-date rules (never past, closed-today push, pending replacement); grants (anon refused).
- `run-shift-close.cjs` (supersedes `run-staff-shifts.cjs` coverage):
  - stamped `business_day`;
  - stale-shift refusal;
  - blind legacy INSERT/UPDATE refused, RPC allowed;
  - the cashier cannot select `shift_expectations` when blind;
  - server expectation frozen, the client value ignored after P1b;
  - forced close needs a note and refuses the holder;
  - closed rows stay immutable.
- `run-cash-remittances.cjs`: creation per mode; CAS transitions; self-accept only for the owner; a branch-locked manager on another branch gets 0 rows or 42501; the discrepancy note constraint.
- `run-day-close.cjs`: open-shift and unsettled refusals; force; advisory lock against a concurrent `open_shift` (two connections); clock-in on a closed day refused; reopen owner-only; deposit set-once; versioning.
- `run-cash-activity.cjs`: through `get_store_activity` as the cashier, their own rows never carry expected or variance on a blind shift; the full view sees `shift.reconciled`.
- All added to `tests/sql/run-all.cjs` (`npm run test:sql`).

**Property tests** (`*.property.test.ts`, `propertyParameters()`, replayable with `FC_SEED`/`FC_PATH`):
- `tests/unit/business-day/trading-day.property.test.ts`:
  - consecutive days tile (`end(d) = start(d+1)`);
  - every instant belongs to exactly one day, with `start ≤ t < end`;
  - `tradingDayOf(start(d)) = d`;
  - day order is monotone;
  - **an empty schedule equals `inventory/business-day.ts` for every instant** (the backward-compatibility pin);
  - a constant cutoff equals `(local − c)` date arithmetic.
- `tests/unit/business-day/trading-day-sql-parity.property.test.ts`: a PGlite worker (shaped like `report-sales-worker.cjs`) evaluates `business_day_of` and `business_day_bounds` on random schedules and instants, against TS.
- `tests/unit/cash/shift-expected-sql-parity.property.test.ts`: random orders, ledgers and movements (cancelled, pay-later, foreign `recordedBy`, cross-outlet, `outlet_id` in the blob only, NBSP and "GCash" names, window edges) → `summarizeShiftDrawer` + `reconcileShift` against `cash.shift_expected`, compared in centavos. **Decision:** run it from the web suite by importing the app's pure modules by relative path. If their import graph pulls in React Native, port the four pure modules (`pos-sales`, `shift-drawer`, `shift`, `cash-drawers` maths) into `src/lib/cash/drawer/` with a textual-parity test, the same pattern as daily-report.
- `tests/unit/cash/denominations.property.test.ts`: TS and SQL total parity; invalid shapes refused.
- `tests/unit/reports/report-sql-parity.property.test.ts`: extended with random cutoff schedules.

**Textual and contract parity:**
- trading-day web ↔ app;
- denominations web ↔ app;
- `resolveOrderBackend` ↔ `cash.tenant_order_backend` truth table;
- staff-permission registries (existing parity test plus the new key);
- the activity vocabulary mirror;
- `ADMIN_SECTION_PERMISSIONS` guardrail;
- merchant-notification parity (P6);
- cash-slip snapshots per paper width, and blind slips with no expected.

**App jest:**
- the close-flow state machine (blind hides expected; offline refused with the draft kept; non-empty outbox blocks; a stale shift forces close-first);
- remittance screens' CAS-conflict handling ("already accepted by Mara");
- `home-period` and `report-window` with schedules.

**Live, opt-in** (real platform DB, read-only, each query starting with `set local statement_timeout = '5s'`):
- `CASH_LIVE=1 CASH_LIVE_TENANT=… npx jest tests/live/cash-expectation-live.test.ts`: recomputes `cash.shift_expected` for the last N closed shifts and reports the drift distribution against the stored device `expected_cash`. This is **the gate for P1b**.
- `BUSINESS_DAY_LIVE=1 …`: report totals for a day under midnight against a test-only cutoff applied inside a rolled-back transaction.

### 8.4 Coverage

80% or more on every new pure module and RPC path, measured with `npm run test:coverage`. The SQL runners cover the RLS paths.

---

## 9. Risks and open questions

| # | Risk / question | Mitigation / recommendation |
|---|---|---|
| R1 | The SQL twin drifts from app arithmetic | Property parity, `engine_version` on every frozen row, shadow phase plus the live probe before it becomes authoritative. |
| R2 | Business-day bucketing slows reports | Constant-cutoff fast path, bounds computed once per query, the 2026-10-14 timeout rule on probes. |
| R3 | Blind close locks out old builds | The toggle warns first. Precedent: unit-limited vouchers. |
| R4 | Offline sales sync after close | Outbox precondition plus the `lateSales` snapshot line. *Verify* `orders.created_at` semantics on sync. |
| R5 | Permission registry merge conflicts with #88 | Sequence after #88. Edge function redeployed with the backfill. |
| Q1 | Should the daily order number reset at the cutoff? | Not in v1. It needs `assign_daily_order_number` and a Convex change. |
| Q2 | Can branch managers reopen a day? | Owner-only in v1. |
| Q3 | Should a shift be required to sell at the register? | Out of scope. Counter cash with no shift shows in the snapshot as `unattributedCounterCashCents`. |
| Q4 | Superadmin read of cash tables during impersonation | Follow `staff_shifts` (none) unless support asks. |
| Q5 | Auto-close forgotten shifts as uncounted (opt-in)? | Deferred. Flag and force close cover v1. |
| Q6 | Suggest the cutoff from `operating_hours` (latest close + 1 h)? | Nice touch for P2 onboarding. Never applied automatically. |

---

## 10. Files referenced

**Existing (verified):**
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260823120000_staff_shifts.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260916150000_staff_shift_custody.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260927120000_staff_shift_server_timestamps.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261001120000_cash_drawers.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261012150000_store_activity.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261012151100_store_activity_stock_cash_triggers.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261012151500_store_activity_rpcs.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261013120050_staff_permission_keys.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261014110000_report_sales_functions.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260916123000_daily_order_number.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260803120000_order_edit_and_payments.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20260809120000_inventory_branch_rls.sql`
- `/Users/codemedavid/Documents/whitelabel/supabase/migrations/20261012120000_merchant_notifications.sql`
- `/Users/codemedavid/Documents/whitelabel/.claude/worktrees/expenses/supabase/migrations/20261022120100_expenses_rpcs.sql`
- `/Users/codemedavid/Documents/whitelabel/.claude/worktrees/expenses/supabase/migrations/20261022120000_expenses.sql`
- `/Users/codemedavid/Documents/whitelabel/src/lib/inventory/business-day.ts`
- `/Users/codemedavid/Documents/whitelabel/src/lib/reports/period.ts`
- `/Users/codemedavid/Documents/whitelabel/src/lib/order-backend.ts`
- `/Users/codemedavid/Documents/whitelabel/src/lib/staff-permissions.ts`
- `/Users/codemedavid/Documents/whitelabel/src/lib/dashboard/read-convex-sales.ts`
- `/Users/codemedavid/Documents/whitelabel/convex-template/convex/orders.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/shift.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/shift-service.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/shift-drawer.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/drawer-expectation.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/drawer-day.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/pos-sales.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/cash-drawers.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/report-window.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/home-period.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/daily-report/parity.test.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/kitchen-chit.ts`
- `/Users/codemedavid/Documents/whitelabel/webnegosyo-app/lib/count-session-service.ts`
- `/Users/codemedavid/Documents/whitelabel/tests/sql/run-staff-shifts.cjs`
- `/Users/codemedavid/Documents/whitelabel/tests/sql/lib/platform-auth.cjs`

**Proposed new (paths only):**
- `src/lib/business-day/trading-day.ts` and its app twin `webnegosyo-app/lib/business-day/trading-day.ts`
- `src/lib/cash/denominations.ts` (+ app twin)
- `webnegosyo-app/lib/cash-slips/{shift-slip,remittance-slip,day-close-slip}.ts`
- `src/app/api/cash/day-close/route.ts`
- `src/app/[tenant]/admin/reports/cash/`
- `tests/sql/run-{business-day,shift-close,cash-remittances,day-close,cash-activity}.cjs`
- `tests/unit/business-day/*.property.test.ts`
- `tests/unit/cash/*.property.test.ts`
- `tests/live/cash-expectation-live.test.ts`