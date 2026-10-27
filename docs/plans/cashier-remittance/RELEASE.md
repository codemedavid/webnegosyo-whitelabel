# Cashier shift, remittance & business day: release runbook

Branch `feat/cashier-remit` (stacked on `feat/expenses`, PR #88). Both ship together, with the owner's go-ahead.
Everything here is **manual and owner-approved**: no agent applies a migration, deploys, or writes to the live
database. Probes are read-only and run inside a transaction that is rolled back.

Rule for every live probe (memory "live perf probes need statement_timeout"): start with
`begin; set local statement_timeout = '5s';`, use a one-day window or a LIMIT, and end with `rollback;`.

---

## 0. Before anything

| Gate | How |
|---|---|
| Suites green on the release commit | `npm run test:sql`, web jest (placeholder env), `cd webnegosyo-app && npx jest`, `npx tsc --noEmit` (web + app), `npm run lint` |
| `origin/main` merged in | main is at Convex **v37** (security release). Merge it, then `npm run convex:prebundle` so the cashier bundle **v39** contains v37's changes (memory "convex-tenant-deploy-pipeline"). Re-run the suites. |
| PR #88 owes a manage-staff redeploy | Fold it into step B2 below (one redeploy carries `expenses` + `cash_manage`). |
| Live bodies unchanged since the branch copied them | Each migration that re-creates an existing function copied the live body on 2026-10-22..27. Before applying, compare `pg_get_functiondef` of: `app_user_has_permission`, `app_user_manages_cash`, `assign_daily_order_number`, `protect_staff_shift_custody`, `store_activity_capture_staff_shift`, `store_activity_category_of`, `app_user_may_read_merchant_notifications`, `report_payments`, `report_sales_by_item`, `report_sales_by_period`, `report_sales_by_hour`, `reporting.profit_facts`, `report_expenses_by_category`, `expenses_drawer_link`. Any drift → merge it into the migration first. |
| Types | After phase A, regenerate `src/types/database.ts` / `src/types/supabase.ts` via the Supabase MCP (never by hand). Remove the narrow casts in `src/lib/cash/*-rpc.ts` only in a follow-up. |

---

## 1. Order at a glance

```
A. DB, additive (no row = today's behaviour)   120000 120200 120300 121000 130000 140000 140100
                                               150000 150010 160000 170000 170010 180000 200000
B. Code                                        B1 web (Vercel)  B2 manage-staff edge fn  B3 app OTA
C. Permission backfill                         120100   (only after B1+B2+B3 are live)
D. Other order backends                        Convex Bulk Deploy v39, own-DB Bulk Deploy v4
E. Alerts                                      190000   (after the OTA has reached the stores' tablets)
F. Server expected cash becomes authoritative  130100   (after ≥ 14 days of shadow + the drift gate, §5)
```

Why this order:
- **A before B**: the new web and app call the new RPCs/columns (`report_shift_sales`, `staff_shifts.business_day`,
  `count_shift` …). Every A migration keeps old builds working: no cutoff row = Manila midnight; no
  `tenant_cash_settings` row = blind off, remittance optional; legacy direct shift opens/closes still pass the
  triggers while a store is not blind.
- **C after B**: production web and `manage-staff` reject unknown permission keys. Backfilling `cash_manage`
  before they know it means an owner can no longer save a backfilled staff account ("Unknown permission key").
  The app OTA must be live too: from it on, `canManageCash` = `cash_manage`. Until C, the
  database still answers `app_user_manages_cash` with the OLD rule (store_setup). So between B3 and C, staff who
  hold store_setup but not cash_manage see no cash-manager screens in the app while the database would allow
  them. Keep B3 → C short (same session).
- **E after the OTA**: from 160000 on, every shift close in a store with remittance mode `optional` (the default)
  creates a pending hand-over (`cash_remittances`), legacy closes from old builds included. 190000 then pushes
  `remittance_pending` to every cash manager after 60 minutes. Old builds have no inbox to clear them. See open
  item R1.
- **F last**: until 130100, `staff_shifts.expected_cash` keeps the register's figure (shadow).

---

## 2. Phase A: migrations, with probes per role

Apply one at a time (`supabase db push` is not used for production; apply each file through the reviewed path the
team uses, then probe). Each file sets `lock_timeout = '3s'`. If a lock times out, wait for a quieter minute and
retry. Never raise the timeout.

Probe helper (paste at the top of each probe block; replace the uuids with real accounts of ONE test store, e.g.
the demo store "Webnegosyo Coffee"):

```sql
begin;
set local statement_timeout = '5s';
-- act as a signed-in account (authenticated role + JWT subject):
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_UUID>', 'role', 'authenticated')::text, true);
-- … probe …
rollback;
```
Roles to probe: **anon** (`set local role anon;` no claims), **cashier** (pos only), **cash manager**
(`cash_manage`, store-wide), **branch-locked manager** (`cash_manage` + `outlet_id`), **owner**, **service role**
(MCP default). Assert row counts, not just "no error": RLS refusals are silent.

| # | File | What it adds | Locks / cost | Probes (expected) |
|---|---|---|---|---|
| A1 | `120000_business_day_cutoffs` | `business_day_cutoffs`, `business_day_cutoff_for/of/bounds`, `set_business_day_cutoff` | new table only | anon: `select public.business_day_of('<T>', now())` → 42501. Cashier: same → today's Manila date. Owner: `select public.set_business_day_cutoff('<T>', 240)` → a future date (then rollback). Cashier: set → 42501. |
| A2 | `120200_cash_settings` | schema `cash`, `cash.tenant_order_backend`, `tenant_cash_settings`, `get/save_cash_settings`, `service_periods` | new objects | `select cash.tenant_order_backend(id), order_backend, convex_deployment_url is not null from tenants limit 50` (service) must agree with `resolveOrderBackend`. Cashier: `get_cash_settings` → defaults. Cashier: `save_cash_settings` → 42501. Manager: save `{"blind_close":true}` → row returned (rollback). Unknown key → 22023. |
| A3 | `120300_staff_shift_business_day` | `staff_shifts.business_day` (backfilled, NOT NULL) + blind/denomination/close columns, triggers | **UPDATE of every staff_shifts row** under replica mode, then `SET NOT NULL` (ACCESS EXCLUSIVE). Check size first: `select count(*) from staff_shifts` (expect small). Apply off-peak. | Service: `select count(*) from staff_shifts where business_day is null` → 0. Cashier: insert a shift row directly as an old build does (inside the rollback) → succeeds, `business_day` = today. |
| A4 | `121000_shift_sales` | `cash.window_sales`, `report_shift_sales`, `report_period_sales`; moves `report_payments`/`report_sales_by_item` bodies into `reporting.*` | function swaps | Same answer before/after for one day: `select * from report_payments('<T>', '<D>T00:00+08', '<D+1>T00:00+08')` as an owner (capture before apply). Cashier (pos only): `report_period_sales` → 42501; `report_shift_sales(<own open shift>)` → server JSON; someone else's shift → 42501. Convex store → `{"source":"unavailable"}`. |
| A5 | `130000_shift_expectations` | `shift_expectations`, `cash.shift_expected`, freeze trigger (**shadow**) | trigger on staff_shifts | Close a test shift (rollback) → one `shift_expectations` row, `mode = 'shadow'`, `expected_cash` unchanged. Cashier: reads own row (not blind). Another cashier: 0 rows. |
| A6 | `140000_business_day_reports` | report period/hour buckets by `business_day_of` | function swaps | No cutoff rows → identical to before for one week (`report_sales_by_period`, owner). |
| A7 | `140100_business_day_adopters` | order number resets at the cutoff, `inventory_counts.business_day` default, drawer expense `spent_on` | `assign_daily_order_number` swap (runs on every order insert, including **anon checkout**) | **anon checkout must still insert**: on the demo store, `set local role anon;` insert an order the way checkout does (rollback). Number = next #, `order_date` = today. Platform order created right after apply gets the next number with no gap/duplicate (`select order_date, order_number from orders where tenant_id = '<T>' order by created_at desc limit 5`). |
| A8 | `150000_cash_activity_and_close` + `150010` (VALIDATE) | `shift_counts`, `open_shift`, `preview_shift_close`, `count_shift`, `close_shift`, `force_close_shift`, blind legacy guard, activity vocabulary | re-adds 2 store_activity CHECKs NOT VALID; 150010 validates in its own transaction (SHARE UPDATE EXCLUSIVE, writes continue) | Cashier: `open_shift` → `opened`/`joined`; `preview_shift_close` (blind off) → expected shown; `count_shift` twice ok, third → 22023 `recount_limit`; `close_shift` without a count → 22023 `count_required`. Another branch's manager: preview → 42501. Manager: `force_close_shift` own shift → 42501. |
| A9 | `160000_cash_remittances` | `cash_remittances`, pickups, accept/dispute/resolve, `accept_remittance_as` (service only), `list_cash_receivers` | trigger on staff_shifts close | Close a test shift (rollback) → one `kind='shift'` remittance, `pending`. Cashier: `accept_remittance` own → 42501. Manager: accept → `accepted`; again → P0002 `remittance_not_pending`. authenticated: `accept_remittance_as` → permission denied. |
| A10 | `170000_business_day_closes` + `170010` (VALIDATE) | `business_day_closes`, status/close/reopen/deposit/get, closed-day guard on clock-in (shared advisory lock) | new table; staff_shifts trigger swap | Manager: `get_day_close_status('<T>', null, '<yesterday>')` → checklist; with an open shift → `close_business_day` 55000 `open_shifts`. After a close (rollback): cashier insert/open a shift on that day → 55000 `day_closed`. Branch manager: store-wide close → 42501. Cashier: `select count(*) from business_day_closes` → 0. |
| A11 | `180000_profit_business_day` | profit day buckets by business day | function swaps | No cutoff rows → `report_profit*` identical for one week (owner). |
| A12 | `200000_report_cash_functions` | `report_cash_summary`, `report_cash_by_staff` | new functions | Cashier → 42501. Manager, 7 days → rows. 94-day range → 22023. |

Hold for later phases: `120100` (C), `190000` (E), `130100` (F).

---

## 3. Phase B: code

| Step | What | Check |
|---|---|---|
| B1 | Web: merge, Vercel deploy (prebuild runs `validate-env.mjs`). | `/[tenant]/admin/cash` opens for an owner. Reports and By shift totals equal Reports' day total. Settings → Hours shows the cutoff row. |
| B2 | `manage-staff` edge function. Fetch the DEPLOYED source first and merge its key list (memory "staff permission registry coordination"); redeploy with `expenses` + `cash_manage`. | Owner saves a staff account with `cash_manage` ticked from the app Team screen → 200. |
| B3 | Merchant app **OTA** (JS only: no new native modules; `package.json`/`app.json` unchanged on this branch; the `cash-alerts` Android channel is created by JS at startup). Use the existing EAS update channel. | Drawer shows the one-hero card; End shift runs count → reveal → remit on a demo shift; Remittances inbox lists it. |

---

## 4. Phase C/D/E

**C — `120100_cash_manage_permission`** (same session as B3):
```sql
-- before: who will receive the key
begin; set local statement_timeout = '5s';
select count(*) from app_users where role = 'admin' and is_owner is not true and permissions is not null
   and 'store_setup' = any (permissions) and not ('cash_manage' = any (permissions));
rollback;
```
Apply. Probe: the same count → 0. A store_setup-only staff account: `select public.app_user_manages_cash('<T>')` →
true. A pos-only account → false. Superadmin → true. Owner edits that account on the web → saves.

**D — other order backends** (after B1, which carries the bundles):
- Superadmin → Convex **Bulk Deploy** (bundle v39 = v37 + business-day order numbers, Trends and the daily snapshot).
- Superadmin → own-database **Bulk Deploy** (order schema v4: `order_date` by business day).
- Until D finishes, do not set a cutoff on a Convex / own-database store. Its old bundle would still reset #01 at
  midnight while its reports use the cutoff. `POST /api/business-day/sync` pushes the cutoff once the bundle knows it.

**E — `190000_cash_alerts`** (after the OTA has reached the stores, about 1–2 days):
- Before: `select count(*) from cash_remittances where status = 'pending' and created_at < now() - interval '60 minutes'`
  (with statement_timeout). Every one of these will push once. Settle or clear test rows first (see R1).
- Apply. Probe: `select jobname, schedule from cron.job where jobname = 'cash-alerts'` → `*/15 * * * *`. A cashier
  (pos only): `select count(*) from merchant_notifications where kind in ('shift_overdue','remittance_pending')` → 0.
  Manager → their branch's rows. Watch `/api/push/notify-merchant` logs for the first two runs.

---

## 5. Phase F: the 130100 drift-probe gate

`130100` flips `cash.expected_mode()` to `'server'`, and from then on the database, not the register, decides what a
drawer should hold on platform stores. Apply only when ALL of these hold over **≥ 14 days of shadow** (after A5):

1. ≥ 200 closed shifts with both figures, across ≥ 10 platform stores.
2. ≥ 95% of them agree within ₱1 (100 centavos).
3. Every shift that differs by more than ₱20 (2000 centavos) has a written explanation, normally "the server saw
   an order the register's page did not". None may show the server MISSING cash the register counted.
4. `server_expected_cents` is NULL (the computation failed) on < 1% of platform closes.

Read-only SQL (service role / MCP `execute_sql`):

```sql
-- 5a. Agreement summary, last 14 days of shadow closes (bounded by computed_at).
begin;
set local statement_timeout = '5s';
select count(*)                                                                    as closes,
       count(*) filter (where server_expected_cents is not null and device_expected_cents is not null) as compared,
       count(*) filter (where abs(server_expected_cents - device_expected_cents) <= 100)               as within_1_peso,
       count(*) filter (where abs(server_expected_cents - device_expected_cents) > 2000)               as over_20_pesos,
       count(*) filter (where server_expected_cents is null and source <> 'none'
                          and cash.tenant_order_backend(tenant_id) = 'platform')                      as server_failed,
       count(distinct tenant_id)                                                   as stores
  from public.shift_expectations
 where mode = 'shadow' and computed_at >= now() - interval '14 days';
rollback;

-- 5b. The differences to explain (largest first).
begin;
set local statement_timeout = '5s';
select e.shift_id, e.tenant_id, t.slug, s.staff_name, s.opened_at, s.closed_at,
       e.device_expected_cents, e.server_expected_cents,
       e.server_expected_cents - e.device_expected_cents as server_minus_device,
       e.breakdown ->> 'cashSalesCents' as server_cash_sales,
       e.breakdown ->> 'saleCount'      as server_sales,
       e.breakdown ->> 'payInCents' as pay_in, e.breakdown ->> 'payOutCents' as pay_out,
       e.breakdown ->> 'collectedCents' as collected, e.breakdown ->> 'refundCents' as refunds
  from public.shift_expectations e
  join public.staff_shifts s on s.id = e.shift_id
  join public.tenants t on t.id = e.tenant_id
 where e.mode = 'shadow' and e.computed_at >= now() - interval '14 days'
   and e.server_expected_cents is not null and e.device_expected_cents is not null
   and abs(e.server_expected_cents - e.device_expected_cents) > 100
 order by abs(e.server_expected_cents - e.device_expected_cents) desc
 limit 50;
rollback;

-- 5c. One shift drilled down: the counter orders the server counted (one shift's window only).
begin;
set local statement_timeout = '5s';
select o.id, o.created_at, o.status, o.payment_method_name, o.total, o.amount_paid,
       o.customer_data -> 'pos' ->> 'cashierId' as cashier
  from public.orders o, public.staff_shifts s
 where s.id = '<SHIFT_ID>' and o.tenant_id = s.tenant_id
   and o.created_at between s.opened_at and s.closed_at and o.source = 'pos'
 order by o.created_at
 limit 200;
rollback;
```
Apply `130100`. Probe: `select cash.expected_mode()` → `server`. Close a demo shift (rollback): `staff_shifts.expected_cash` =
`shift_expectations.server_expected_cents / 100`. Rollback = the same function returning `'shadow'` (frozen rows
keep the mode they were frozen under).

---

## 6. Rollback, per migration (reverse order; each file's "Rollback (manual)" block holds the exact SQL)

| File | Rollback | Data caveat |
|---|---|---|
| 200000 | drop the two `report_cash_*` and `reporting.assert_cash_report_access` | none |
| 190000 | `cron.unschedule('cash-alerts')`; restore the 2-arg read policy; delete cash-kind notifications; restore kind check | cash notifications are lost (they are re-derivable) |
| 180000 | re-create `reporting.profit_facts` (20261022130100) + `report_expenses_by_category` (20261022120300) | none |
| 170010 / 170000 | re-create `staff_shift_business_day_stamp` from 150000; drop day-close functions and `business_day_closes` | **day closes and deposits are lost**: export the table first |
| 160000 | drop trigger + functions + `cash_remittances`; drop the 3 `shift_cash_movements` columns | **hand-overs are lost**: export first |
| 150010 / 150000 | see file; drops `shift_counts`, `float_kept_cents` | counts lost; shifts stay closed |
| 140100 | re-create `assign_daily_order_number` (20260924120000) + `expenses_drawer_link` (20261022120000) | orders keep their `order_date` |
| 140000 | re-create both report functions from 20261014110000 | none |
| 130100 | function returning `'shadow'` | none |
| 130000 | drop trigger, table, helpers | frozen expectations lost |
| 121000 | re-create `report_payments` (20261014150000), `report_sales_by_item` (20261014110000); drop the rest | none |
| 120300 | see file (re-create custody from 20261001120000, drop columns) | business_day and close facts lost |
| 120200 | drop `service_periods`, settings, schema `cash` (cascade) | store rules lost |
| 120100 | restore the old `app_user_manages_cash` (body in the file). Leave the backfilled key: it is inert | none |
| 120000 | drop cutoff functions + table | stores fall back to midnight |

Code rollback: Vercel instant rollback to the previous deployment; app: republish the previous OTA update; the
edge function keeps the union of keys (harmless). Roll the database back only AFTER the code that calls it.

---

## 7. Open items from the qa review (decide before release)

- **R1 (HIGH, behaviour on apply)**: in `optional` mode (the default) every close, including legacy closes from builds
  older than B3, creates a pending hand-over, and 190000 pushes each one after 60 min. Decide one: create the
  shift remittance only when the close came through `close_shift` (`cash.shift_rpc_mark = 'close'`), or alert only
  on remittances with a receiver, or ship `remittance_mode` default `off` until the store's tablets have the OTA.
- **R2 (HIGH, sales visibility)**: `get_business_day_close` masks sales for accounts without `reports`, but
  `get_day_close_status.preview`, the `close_business_day` reply and a direct `select snapshot from
  business_day_closes` (cash-manager RLS) return the sales unmasked. Either mask on every path (and revoke
  `select (snapshot)` from `authenticated`) or decide that `cash_manage` includes the day's sales, as
  `report_shift_sales` already does, and say so in the key's description.
