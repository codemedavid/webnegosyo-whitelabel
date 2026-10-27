# 05 — Live platform data: shifts, drawers, night trade, day cutoff

Source: platform Supabase, read-only, every query prefixed `set local statement_timeout = '5s'`. Run 2026-10-26. Windows: last 30/60 days. No phones, emails or customer names were read. Stores are named by slug only.

Table sizes: `staff_shifts` has 304 rows in total (first shift 2026-09-19, so the feature is about 5 weeks old). `cash_drawers` has 19 rows, `shift_cash_movements` 44, `orders` about 30k (20 MB). Order queries go through `orders_tenant_created_idx (tenant_id, created_at DESC)` with a `tenants CROSS JOIN LATERAL`. There is no index on `created_at` alone, so never filter orders by time without `tenant_id`.

---

## 1. Schema

### `staff_shifts`
Columns: `id, tenant_id, outlet_id?, staff_user_id?, staff_name, status ('open'|'closed'), opening_float numeric, expected_cash numeric?, closing_count numeric?, note?, opened_at, closed_at?, created_at, drawer_id?, drawer_name?, is_zero_balance bool, closed_by uuid?, closed_by_name?`

Money is stored as **numeric pesos, not centavos.** The reports engine works in integer centavos, so a remittance feature has to convert.

Constraints:
- `status` must be open or closed.
- `closed_consistency`: open ⇔ `closed_at IS NULL`.
- Floats and counts must be ≥ 0.
- A zero-balance shift must have float = 0.
- Foreign keys to outlets, drawers (RESTRICT) and auth.users (SET NULL).

Indexes:
- `idx_staff_shifts_tenant_opened (tenant_id, opened_at DESC)`
- `idx_staff_shifts_staff (tenant_id, staff_user_id, opened_at DESC)`
- UNIQUE one open shift per staff: `(tenant_id, staff_user_id) WHERE status='open'`
- UNIQUE one open shift per drawer: `(drawer_id) WHERE open AND drawer_id NOT NULL`

Triggers:
- `stamp_staff_shift_times`: for `authenticated` callers the server stamps `opened_at`, `closed_at` and `closed_by = auth.uid()`, and wipes any client-sent close fields on insert.
- `protect_staff_shift_custody`: a closed shift is immutable. Tenant, outlet, staff, `opened_at`, float and drawer can never change. A close requires both `expected_cash` and `closing_count`.
- `staff_shift_drawer_snapshot`: copies the drawer name and zero-balance flag onto the shift and refuses archived drawers or drawers from another branch.
- `staff_shift_branch_belongs_to_tenant`
- `store_activity_*` (activity log). A variance is flagged when |count − expected| ≥ ₱100 (`store_activity_flag_drawer_variance`).

RLS (authenticated only):
- SELECT `staff_shifts_read_branch` = `app_user_may_reach_branch(tenant_id, outlet_id)`.
- INSERT `staff_shifts_open_own` = can reach the branch, AND `staff_user_id = auth.uid()`, AND status is open, AND the user is the owner, has `permissions IS NULL`, or has `pos`.
- UPDATE `staff_shifts_close` = can reach the branch, AND the row is open → closed, AND (it is your own shift OR `app_user_manages_cash`).
- No DELETE policy.

### `cash_drawers`
Columns: `id, tenant_id, outlet_id?, name (1–40), starting_cash numeric (0–10M), is_zero_balance (⇒ starting_cash = 0), sort_order, archived_at?, created_at`.

Indexes: `(tenant_id, outlet_id, sort_order)`, plus UNIQUE live name per tenant+branch.

RLS: read = branch reach. Insert and update = branch reach + `app_user_manages_cash` (an admin who is the owner, has `permissions NULL`, or has `store_setup`). No DELETE; drawers are archived instead.

### `shift_cash_movements`
Columns: `id, tenant_id, outlet_id?, shift_id, kind ('collect'|'pay_in'|'pay_out'), amount numeric (>0, ≤10M), reason (≤200; required except for collect), recorded_by uuid?, recorded_by_name, created_at`.

Indexes: `(shift_id, created_at)`, `(tenant_id, created_at DESC)`.

Trigger `shift_cash_movement_guard`: the shift must belong to the same tenant and still be OPEN. It copies `outlet_id` from the shift and, for authenticated callers, stamps `created_at = now()` and `recorded_by = auth.uid()`.

RLS: read = branch reach. Insert = branch reach + the shift is open + (own shift OR manages cash). **The table is append-only: no UPDATE or DELETE policy.**

### Related functions
- `app_user_manages_cash(tenant)`
- `approval_open_shift(tenant, user, outlet)` (definer; latest open shift)
- `record_drawer_expense(...)`: inserts a `pay_out` movement and an `expenses` row with `paid_from='drawer'`
- `sort_drawer_payout(...)`
- `expenses_drawer_link`: sets `expenses.spent_on = (movement.created_at at time zone 'Asia/Manila')::date`
- `store_activity_capture_staff_shift` and `store_activity_capture_shift_cash_movements`

**"collect" already exists as a movement kind.** It is effectively a mid-shift cash pickup, which is the closest existing thing to a remittance.

### Remit / turnover / business_day / cutoff / timezone columns
A search over every public column for `remit|turnover|business_day|cutoff|cut_off|day_start|day_end|rollover|reset_hour|end_of_day|eod|z_read|x_read|closing_time|timezone` found only:
- `tenants.timezone text DEFAULT 'Asia/Manila'`. All **302/302** tenants hold `Asia/Manila`.
- `outlets.timezone text`. All **19/19** are NULL, which means they inherit the tenant's zone.
- `inventory_counts.business_day date`. This is a stocktake day stamp, not a cutoff setting.

There are no remit or turnover tables or columns. The `store_*` tables are `store_activity`, `store_onboardings`, `store_tax_profiles` and `store_tax_profile_changes`; none has a day or cutoff field.

### Operating hours
- Stored in `tenants.operating_hours jsonb` and `outlets.operating_hours jsonb` (outlets override the tenant). The shape is `{"0".."6": {"open":"HH:MM","close":"HH:MM","closed":bool}}`, with 0 = Sunday.
- Hours are enforced at checkout only when `tenants.enforce_operating_hours` is true.
- Coverage: 69 of 302 tenants have hours set, and only 15 enforce them. 0 of 19 outlets have hours.
- Interpretation in code:
  - `src/lib/store-open-status.ts` and the SQL `store_activity_is_after_hours` treat `close < open` as an overnight window that carries over from the previous day.
  - `src/lib/operating-hours.ts#getDayWindow` treats `close ≤ open` as **malformed** and falls back to the default window. These two readers already disagree.

How many stores close after midnight (of the 69 with hours):

| | stores |
|---|---|
| any open day with `close < open` | **14** (3 of them enforce hours) |
| – of which close exactly 00:00 (midnight) | 7 |
| – close 01:00–04:00 (true night trade) | 6 (01:00 ×2, 02:00 ×1, 03:00 ×2, 04:00 ×1) |
| – close 19:00 with a later open (data-entry oddity) | 1 |
| `close = open` on some day (24 h or a typo, e.g. 09:00–09:00) | 2 |
| close ≥ "24:00" | 0 (the format never stores it) |
| latest same-day close otherwise | mostly 21:00 (17), 22:00 (9), 23:00 (8), 20:00 (6) |

---

## 2. Shift usage (last 60 days; the whole table history is inside this window)

| metric | value |
|---|---|
| tenants that opened a shift, 60 d / 30 d | **32 / 24** |
| outlets (branches) with shifts | 4 (all in one multi-branch store; every other store has `outlet_id` NULL) |
| shifts, 60 d / 30 d | 304 / 280 → **9.3 shifts per day** platform-wide over the last 30 d |
| active tenant-days | 179. 129 had 1 shift, 39 had 2, 11 had 3 or more (avg 1.36 per active day) |
| days with more than one staff member / more than one drawer | 7 / 14 |
| overlapping concurrent shifts (both < 24 h) | 6 pairs |
| live drawers / tenants with drawers | 15 / 6 (19 including archived). 5 live drawers are zero-balance |
| shifts on a named drawer / zero-balance shifts | 87 / 58 (all 58 zero-balance shifts are at one store) |
| shifts with opening float = 0 | 181 of 304 (60%) |
| concentration | 5 stores hold 226 of 304 shifts (74%): 68, 64, 36, 34, 24 |

Cash movements (60 d, all within the last 30 d):

| kind | n | tenants | median ₱ | max ₱ | recorded by someone other than the shift holder |
|---|---|---|---|---|---|
| collect | **5** | 5 | 206 | 6,026 | 3 |
| pay_in | 15 | 3 | 73 | 3,500 | 0 |
| pay_out | 24 | 4 | 105 | 3,000 | 0 |

Duration of closed shifts (278 shifts):
- Median **8.85 h**. p25 0.97 h, p75 12.3 h, **p90 25.8 h**.
- 61 shifts (22%) lasted under 15 minutes. These are tests, or open-and-close to "see the total".

Crossing Manila midnight:
- **97 of 278 (35%)** closed shifts open on one Manila calendar date and close on another.
- Genuine night shifts (≤ 16 h long, crossing midnight): **48 (17%) across 8 tenants**. 32 of them close before 06:00.
- The other ~49 are forgotten shifts that ran over a day.

Forgotten shifts:
- Closed shifts longer than 16 h: **51**. Longer than 24 h: **34** (12% of closed).
- Currently open: 26. Of these, **22 have been open for more than 24 h and 20 for more than 7 days.** Abandoned open shifts are common.
- Per-store medians make the pattern visible. One night store has a median shift of 24.7 h: the shift is closed the next day. One store has a 193 h shift.

Closed by someone other than the opener:
- `closed_by` has been stamped since 2026-10-01. The 34 shifts closed earlier are NULL.
- Since then, **4 of 244 (1.6%)** were closed by another user.

Variance (`closing_count − expected_cash`), all 278 closed shifts:
- 210 exact (76%), 35 short, 33 over. 37 of the exact ones are trivial (₱0 expected and ₱0 counted).
- Raw extremes: −₱25,044 / +₱10,000,000. The second is a fat-finger, and the cap allows it.

Variance on "real" shifts (≥ 30 min and expected > 0): **201 shifts, 13 tenants**.

| bucket | n | % of 201 |
|---|---|---|
| exact ₱0 | 148 | **73.6%** |
| short | 31 | 15.4% |
| over | 22 | 10.9% |
| ±₱0–20 | 8 | 4% |
| ±₱20–100 | 6 | 3% |
| ±₱100–500 | 14 | 7% |
| ±₱500–2,000 | 8 | 4% |
| ±>₱2,000 | **17** | **8.5%** |
| flagged (≥ ₱100) | 39 | 19% |

- Median short: **−₱2,040**. Median over: **+₱148**. Median |variance| when not exact = **10.5% of expected**. 18 shifts were off by more than 50% of expected.
- Expected cash per shift: median ₱5,794, p90 ₱16,934.

**Big shortfalls look like unrecorded remittances, not theft:**
- 15 of the 17 >₱2k cases are shorts, at 8 tenants.
- At the largest night store, all 7 big shorts average −₱15,722, which is **100% of expected cash**. 3 of them were counted at ₱0.
- Elsewhere big shorts run 35–100% of expected.
- None of those shifts carried a `collect` movement: only 3 of the 8 tenants have ever used `collect`, once each.
- Pattern: the owner or manager takes the cash, then the cashier counts an empty or near-empty drawer, so the variance swallows the handover.

---

## 3. Night trade (platform `orders`, last 30 d, status ≠ cancelled, Asia/Manila)

- 55 tenants have orders in the window and 22 have ≥ 20 orders. Total 22,447 orders.
- **4.9% of all orders (1,104) fall between 00:00 and 05:59.**

Last-order time: each order is assigned to a business day with a 06:00 cutoff, and the figure is the median and p90 of each day's last order.

| store (≥20 orders) | orders | 00–05:59 % | 22–23:59 % | median last order | p90 last order |
|---|---|---|---|---|---|
| gungjeon-unlimited (5 branches) | 8,751 | 0.0 | 3.5 | 22:39 | 23:41 |
| papajays-grillhouse | 3,310 | **15.7** | 16.1 | **05:29** | 05:54 |
| puesto | 2,631 | **17.4** | 15.8 | **04:20** | 05:46 |
| daily-dash-x-la-pasta | 2,313 | 0.0 | 0.0 | 20:35 | 21:04 |
| cribings-kitchen-by-pasabytes | 797 | 0.0 | 0.8 | 20:52 | 22:34 |
| jinbin-korean-grill-and-bbq | 663 | 0.0 | 0.0 | 20:26 | 20:55 |
| haro-haro-lipa-city-branch | 658 | 0.0 | 0.0 | 18:21 | 18:42 |
| tipsy-cue | 577 | **15.1** | 17.3 | **00:48** | 02:42 |
| craving-street | 540 | 0.0 | 0.0 | 19:34 | 20:00 |
| s-kad-bistro | 449 | 0.0 | 5.6 | 21:51 | 22:36 |
| aza-aziz-bakery-shop | 290 | 0.0 | 0.0 | 20:47 | 21:07 |
| sorpresso | 280 | 0.0 | 0.4 | 20:41 | 21:33 |
| kampus-bytes | 201 | 0.0 | 0.0 | 18:20 | 20:45 |
| shak-owl | 184 | **10.3** | 23.9 | 23:52 | 01:41 |
| snxp-ktchn | 155 | 0.6 | 15.5 | 22:44 | 23:47 |
| serenity-cafe | 132 | 0.0 | 0.8 | 20:05 | 21:11 |
| no-label-2608 | 86 | 0.0 | 0.0 | 14:29 | 16:51 |
| uncle-drei-s-teasnacks… | 78 | 0.0 | 0.0 | 19:31 | 19:33 |
| lolys-cafe | 75 | **12.0** | 8.0 | 23:16 | 01:39 |
| kafe-sikad | 68 | 1.5 | 23.5 | 22:20 | 23:51 |
| lolila-s-deli | 36 | 2.8 | 8.3 | 17:45 | 22:35 |
| ate-lolet-special-inasal | 32 | 0.0 | 0.0 | 19:06 | 20:20 |

- **>5% night share: 5 of 22 stores.** papajays, puesto, tipsy-cue, shak-owl, lolys.
- **>15%: 3 stores.** papajays, puesto, tipsy-cue.
- These 5 stores are also 4 of the 5 heaviest shift users.
- Typical last order for a day-trade store is 20:00–22:40. For night stores it is 00:48–05:29.

Orders per Manila hour at the night stores show where a cutoff could fall:
- **puesto** (opens 10:00): 0h 153 · 1h 108 · 2h 85 · 3h 65 · 4h 34 · 5h 13 · 6h 16 · 7h 29 · **8h 4 · 9h 1** · 10h 18. Quiet window 08–10.
- **papajays** (no hours configured): 0h 199 · 1h 119 · 2h 73 · 3h 52 · 4h 44 · 5h 33 · **6h 25** · 7h 46 · 8h 51 · … It trades all 24 hours. The quietest hour is 06:00, but it still has orders. **No cutoff time is order-free for this store.**
- **tipsy-cue**: 0h 50 · 1h 25 · 2h 9 · 3h 3 · then nothing until 13h. Any cutoff between 04:00 and 12:00 works.
- **shak-owl**: last orders at 2h, nothing again until 12h.
- **lolys-cafe**: its configured hours say 09:00–21:00, yet 12% of its orders arrive at 00:00–01:59.

Configured hours do not reliably predict night trade. Papajays has none set, and Lolys' hours say 21:00. Puesto (10:00–02:00), shak-owl (12:00–03:00) and tipsy-cue (14:00–04:00) do set overnight hours.

**Effect today:** `assign_daily_order_number` resets the order counter at Manila midnight (`order_date = created_at at time zone tenant.timezone`). At the three >15% stores, the counter therefore goes back to #01 in the middle of service. Daily reports (`report_sales_by_period`, which only allows `Asia/Manila`) also split one night's trade across two dates.

---

## 4. Existing settings that look like a day cutoff

There is **none.** Every "day" on the platform is the Manila calendar day (00:00 +08:00):
- `assign_daily_order_number` → `orders.order_date` and `daily_order_counters.order_date` use `tenants.timezone`.
- `store_activity_manila_day_start` and `reporting.manila_day_on_or_after` hard-code `Asia/Manila`.
- `report_sales_by_period` and `report_sales_by_hour` reject any `p_tz` other than `Asia/Manila`.
- `expenses_drawer_link` and `expenses_spent_on_window` use the Manila calendar date.
- `src/lib/inventory/business-day.ts` uses a fixed +08:00 offset, with a comment saying "If the platform ever ships outside PH this becomes a per-tenant setting".

Nearby settings that are not cutoffs:
- `tenants.timezone` and `outlets.timezone` (all Manila or NULL)
- `operating_hours` and `enforce_operating_hours`
- `sms_settings.quiet_hours_start/end` and `sms_campaigns.quiet_hours_*`
- `order_types.advance_order_lead_time_minutes`
- `tenant_subscriptions.billing_anchor_date` (billing, unrelated)
- `inventory_counts.business_day` (a stamped date, not a rule)

## Interpretation for the feature

1. **A per-store business-day cutoff is needed by real stores.** 5 of 22 active stores take more than 10% of their orders after midnight. 3 take more than 15%, including the #2 and #3 stores by order volume (papajays, puesto). 17% of closed shifts are genuine night shifts that cross midnight. A fixed 06:00 default fits 21 of 22 stores. Papajays trades around the clock (its trough is 06:00 with 25 orders a month), so the setting must be editable, and a shift-based Z (close of the last shift) may suit it better than a clock time.
2. **Do not derive the cutoff from `operating_hours`.** 77% of stores have none, and those that exist disagree with real trade (Lolys). Two code readers also interpret `close ≤ open` differently.
3. **Remittance fills an observed gap.** 8.5% of real shifts close more than ₱2,000 off, almost always short, often by 70–100% of expected cash. Only 5 `collect` movements exist platform-wide. Recording the handover (who received it, how much) should turn most of these "shorts" into explained remittances.
4. **Forgotten shifts are the norm at several stores:** 22 open for more than 24 h, 20 for more than 7 days. 12% of closed shifts ran longer than 24 h. A business-day close needs a way to sweep or force-close stale shifts, and a manager-close path. Closing someone else's shift is rare today (1.6%), but it is permitted by `app_user_manages_cash`.
5. **Schema notes for builders:**
   - Money here is numeric pesos while reports use centavos.
   - Movements are append-only, need an open shift, and the server stamps time and actor.
   - A closed shift is immutable (custody trigger). Remittance on a closed shift therefore needs its own table or must happen before the close.
   - One open shift per staff member and one per drawer are already enforced by unique indexes.
   - Branch scoping is by `app_user_may_reach_branch`, and outlet usage is tiny: only 4 branch IDs ever appear on shifts.
