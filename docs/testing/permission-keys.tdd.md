# Phase 0d — permission keys `reports`, `inventory`, `costs` (TDD evidence)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §6 (roles), §8.7 (HIGH-3), §9 Phase 0d.

## What changed

| Area | Change |
|---|---|
| Registry (4 copies: web, app, desktop, manage-staff edge fn) | `reports` (IMPLIED_BY `analytics`), `inventory`, `costs` appended after `loyalty_redeem`. Web also exports `ORDER_READ_KEYS`, `PAYMENT_READ_KEYS`, `hasAnyPermission`, `editablePermissions`, `OPEN_ADMIN_SECTIONS`. |
| Web route map | `/admin/inventory/**` → `inventory` (was `menu`); `/admin/addons` → `menu` (was **open to every staff account**); `/admin/reports` → `reports` (registered before the route exists). |
| Route guardrail | `tests/unit/staff-permissions-reports-inventory.test.ts` walks every directory under `src/app/[tenant]/admin` and fails unless it is mapped or listed in `OPEN_ADMIN_SECTIONS` (settings, learn, start) with a reason. |
| Staff editors | A legacy full-access account (`permissions: null`) now opens with every key ticked (`editablePermissions`). It used to open with nothing ticked, so the first Save stripped every grant. |
| "Review staff access" | Owner-only dashboard card while any staff account is still on full access (`src/lib/staff/staff-access-review.ts`, `review-staff-access-nudge.tsx`, `review-staff-access-card.tsx`). Dismissal per store per browser (localStorage); disappears for good once nobody is on full access. 36 stores / 44 accounts today. |
| Daily revenue | `getDailyRevenue` returns **net sales** by the 0c sales model on Supabase backends (was Σ order total incl. delivery + service). Convex keeps order totals until Phase 7; `revenueBasisFor` says which. |
| DB | three migrations, below. |

## Migrations

| File | State | What |
|---|---|---|
| `20261013120050_staff_permission_keys.sql` | **APPLIED 2026-10-13** (`staff_permission_keys`), probed | `app_user_has_permission` defined in full on this branch (it existed live only from the unmerged gov-discounts/store-activity branches). Strict superset of the live body: adds `reports` ← `analytics`. Changes nobody's access today (no one holds `reports` by name). |
| `20261013120100_inventory_costs_permission_gates.sql` | **Rehearsed, NOT applied — apply with the deploy** | Backfill `inventory`+`costs` onto every scoped `menu` holder (27); stock writes → `inventory`; a delivery PRICE → `costs` (dropped otherwise); ingredient row split (master `menu`, `unit_cost` `costs`, changing `reorder_level` `inventory`); `order_item_costs` → `costs`; counts/transfers paperwork → `inventory`. |
| `20261013120200_order_reads_need_permission.sql` | **Rehearsed, NOT applied — apply with the deploy** | HIGH-3: `orders` (and `order_items` through its EXISTS) need one of `ORDER_READ_KEYS`; `order_payments` + `order_revisions` need one of `PAYMENT_READ_KEYS`. Staff INSERT/UPDATE policies on the same tables carry the same check (a plain INSERT never consults a SELECT policy). |

### Why two migrations wait for the deploy

The web in production and `manage-staff` v5 validate a permission list against their own registry and **reject any unknown key** (`validatePermissionKeys` → "Unknown permission key: inventory"). Applying the backfill before the new registry ships would stop owners editing 27 staff accounts. HIGH-3 waits for the app build that hides Home takings from accounts without an order key (2 live accounts: one `menu`-only, one `branch_staff`-only), otherwise they would see ₱0.

## Live probes

### Applied function (`staff_permission_keys`), as `authenticated`

| Account | reports | analytics | activity_view (opt-in) | reports at another store |
|---|---|---|---|---|
| staff with `analytics` | t | t | f | f |
| scoped, no `analytics` | f | f | f | f |
| legacy NULL | t | t | f | f |

ACL unchanged: `postgres, authenticated, service_role` (no anon).

### Rehearsal of 120100 + 120200 inside `BEGIN … ROLLBACK` (45 probes, all as expected)

One real store-wide staff account (gungjeon) re-scoped inside the transaction; RAW SHRIMPS, branch 22ea061e.

| # | Account | Probe | Result |
|---|---|---|---|
| B1 | — | menu holders missing inventory/costs after backfill | 0 |
| B2 | — | accounts holding both new keys | 27 |
| B3 | — | new keys on an account without menu | 0 |
| 4–11 | `menu` | receive / rename / cost / reorder / orders / items / payments / dish costs | 42501 Inventory · ok 1 · 42501 Costs · 42501 Inventory · 0 · 0 · 0 · 0 |
| 12–19 | `inventory` | receive / rename / reorder / branch par / cost / open count / orders / dish costs | ok 1 · 42501 Menu · ok 1 · ok 1 · 42501 Costs · passed the grant, refused by the existing one-open-count index (23505) · 0 · 0 |
| 20–22 | `costs` | cost / dish costs / receive | ok 1 · 157 · 42501 Inventory |
| 23–27 | `pos` | open count / orders / items / payments / revisions | 42501 Inventory · 7045 · 13687 · 3269 · 23 |
| 28–30 | `kitchen` | orders / items / payments | 7045 · 13687 · **0** |
| 31–32 | `analytics` | orders / payments | 7045 · 3269 |
| 33–34 | `customers` | orders / payments | 0 · 0 |
| 35–39 | legacy NULL | receive / cost / orders / payments / dish costs | ok 1 · ok 1 · 7045 · 3269 · 157 |
| 40–42 | owner | receive / orders / cost | ok 1 · 7045 · ok 1 |
| 43–45 | anon | orders / payments / checkout INSERT | 0 (no error) · 0 · ok 1 |

Plan check (as a `pos` staff, 30-day queue read, 200 rows): the permission check is **InitPlan 7, loops=1** — once per statement, not per row; index scan on `orders_tenant_created_idx`; 3.1 ms.

### Review follow-up rehearsal (rolled back)

| Account | Probe | Result |
|---|---|---|
| `inventory` | receive 1 @ ₱9,999 on RAW SHRIMPS (cost 0.33) | recorded; movement `unit_cost` NULL; ingredient cost **still 0.330000**, qty +1 |
| `inventory`+`costs` | same | recorded at 9999; cost blended to 0.890150 |
| `menu` | insert order (no RETURNING) / update an order / insert payment | 42501 RLS · 0 rows · 42501 RLS |
| `pos` | same | ok 1 · ok 1 · ok 1 |
| `kitchen` | same | ok 1 · ok 1 · 42501 RLS (no till) |
| anon | checkout insert / read orders | ok 1 · 0 |

### Repeatable (PGlite, Phase 0e)

`tests/sql/run-permission-keys.cjs` (`npm run test:sql`, in CI) loads 120000 and 120200 over a stub of the live schema (helper functions and the policies 120200 alters, copied from live on 2026-10-14) and re-checks this table on every run: 57 checks as anon, owner, legacy, `pos`/`kitchen`/`analytics`/`orders`/`menu`/`customers` staff, branch-locked staff and superadmin, plus the InitPlan shape. Mutation-checked: letting `kitchen` read payments fails it. 120100 is not loaded (needs the whole inventory schema).

Also found while mirroring live: orders, payments and revisions carry `platform_staff_*` SELECT/INSERT/UPDATE policies (the SmartMenu platform-staff seat), which 120200 leaves alone; and orders with no branch are invisible to branch-locked staff, before and after 0d.

## Reviews

Security review: 1 HIGH, 2 MEDIUM, 4 LOW. Code review: 0 CRITICAL/HIGH, 2 MEDIUM, 1 LOW.

| Finding | Outcome |
|---|---|
| HIGH — a priced delivery let an `inventory`-only account rewrite ingredient cost (the blend runs at trigger depth 2, past the `costs` check) | **Fixed.** DB guard drops `unit_cost` without `costs`; `movementInputForCaller` / `movementResultForCaller` in the web action and the app route; the price input is shown only with `costs` (web dialog, app sheet). Plan matrix updated: a clerk's delivery is recorded uncosted. |
| MEDIUM — HIGH-3 bounded reads only; a plain INSERT skips SELECT policies | **Fixed.** Same keys on orders insert/update, payments insert (refund grant kept), revisions insert. |
| MEDIUM — web ingredient editor resent the loaded price/level (stale after a delivery re-blend → refused for a change nobody made) | **Fixed.** `ingredientUpdateForCaller` leaves out what the account can't change; the server keeps stored values for absent fields. Reorder field hidden on edit without `inventory`. |
| MEDIUM — `costs` described as DB-enforced while `unit_cost` is API-readable | **Corrected** in the registry comment; read-hiding stays a P3/P5 item (§8.8). The page still ships prices in the RSC payload to non-`costs` accounts — same exposure as the API, closes with the cost table. |
| LOW — movement result echoed the frozen cost | **Fixed** with the H1 helpers. |
| LOW — a starting reorder level needs only `menu` | **Kept, documented**: it rides with adding the ingredient; changing it is `inventory`. |
| LOW — deploy window between web ship and backfill | Runbook: apply 120100 immediately after the web ship. |
| LOW — loyalty/customer-capture order reads | Checked: callers pass the service-role client; HIGH-3 does not affect them. |
| LOW — `get_menu_insights` margin basis | Checked: it returns rank, units, revenue and price only — no cost figures. |
| Pre-existing — daily report Cost/Recount cells under each other's header | **Fixed** (test-first). |

## Tests

- `tests/unit/staff-permissions-reports-inventory.test.ts` — keys, containment, order-read sets, `editablePermissions`, route map, route guardrail (RED: `editablePermissions` / `OPEN_ADMIN_SECTIONS` missing → GREEN 41/41).
- `tests/unit/staff/staff-access-review.test.ts` — who is asked, link, wording, per-store dismissal (RED: module missing → GREEN 12/12).
- `tests/unit/permission-keys-migration.test.ts` — the three migrations pinned to `IMPLIED_BY`, `ORDER_READ_KEYS`, `PAYMENT_READ_KEYS` (14/14; written after the SQL, as pins).
- `tests/unit/inventory-daily-revenue-read.test.ts` — net sales (fees out, food discount out, delivery discount off delivery only), non-live orders out, basis helper (RED 2 + 1 → GREEN 26/26).
- Updated: `staff-permissions.test.ts`, parity tests (4 copies), `manage-staff-core.test.ts`.

## Deploy runbook (order matters)

1. Re-read the live bodies of `inventory_items_client_guard`, `inventory_stock_client_guard`, `stock_movements_client_guard` and the three order SELECT policies; if any changed since 2026-10-13 (another workstream), merge before applying.
2. Deploy `manage-staff` with the new keys **merged onto the deployed v5** (v5 already carries `discount_review` from the gov-discounts branch, which this branch does not have — deploying this branch's `staff-core.ts` as-is would drop it).
3. Ship the web (registry, pickers, inventory gates, review card).
4. IMMEDIATELY apply `20261013120100` (backfill + gates) — until it runs, `menu` holders are refused `/admin/inventory` by the new route map. Probe B1–B3 and the `menu`/`inventory`/`costs` rows above, outside a transaction where safe.
5. Ship the app OTA (Home takings hidden without an order key, cost displays behind `costs`).
6. Apply `20261013120200` (HIGH-3). Probe the `menu`/`kitchen`/anon rows; watch Postgres logs for 42501 on `orders` for an hour.
7. Regenerate `src/types/database.ts` via the Supabase MCP.

## Coordination with other branches

- `app_user_has_permission` is redefined by gov-discounts (`20261012110000`) and store-activity (`20261012140000`); this branch's version sorts later and is their superset. A later redefinition must keep the `reports` line (the migration test pins it).
- The low-stock bell (`app_user_may_read_merchant_notifications` + push rule + app `canSeeMerchantNotifications`) is in the merchant-notifications workstream (uncommitted in the main checkout); it still checks `menu`. That workstream should move all three to `inventory` together. Nobody loses the bell meanwhile: every `menu` holder gets `inventory`.
- store-activity adds opt-in keys (`activity_view`, `approve_requests`) to the same four registries; merging will conflict textually in the key lists only. `editablePermissions(null)` must then exclude opt-in keys (use its `isGrantedByFullAccess`).

## Found, not fixed

- **Cost columns are still readable by every staff account**: `inventory_items.unit_cost`, `stock_movements.unit_cost`. The UI hides them without `costs`; the database does not. Plan §8.8: move cost into a `costs`-gated table with the profit pages (P3/P5).
- **Start here shows average order value and order counts to any staff account** of an onboarded store in its first 60 days (`goal-trackers.ts`, service-role read). Left open in `OPEN_ADMIN_SECTIONS` because that page is being edited in another session; the fix there is to hide the money trackers without `reports`.
- `stock_alerts` and `inventory_audit_log` reads are branch-scoped only (no key). Low risk (no money, no PII); revisit with the web bell (P6).
