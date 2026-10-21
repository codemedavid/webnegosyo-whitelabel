# Expenses: build contract

This is the shared contract every build agent codes against. The plan is in `docs/plans/2026-10-21-expense-tracker.md`. If you need to change this contract, edit this file first and say so in your report.

**Code ownership**
- TypeScript types: `src/lib/expenses/types.ts`. Edit by contract change only.
- SQL: the migrations under `supabase/migrations/20261022*_expenses*.sql`, owned by the DB agent.

## 1. Money and dates

- **Money is integer centavos everywhere.** Use `bigint` in SQL and `number` in TypeScript, through `src/lib/reports/money.ts` (`toCents`, `fromCents`, `sumCents`).
- **`shift_cash_movements.amount` is numeric pesos.** The link check is `round(amount * 100) = amount_cents`.
- **`spent_on` is the Asia/Manila business date** (`date`).
  - For drawer rows it is the Manila date of the movement's `created_at`.
  - For other rows the client sends it, defaulting to today in Manila. It may not be later than today in Manila (server check, `+1 day` tolerance) and may not be more than 400 days in the past.

## 2. Tables (`public`)

### `expense_categories`

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| tenant_id | uuid not null → tenants on delete cascade | |
| system_key | text null | seed key; unique `(tenant_id, system_key)` where not null |
| name | text not null | 1–60 chars after trim; unique `(tenant_id, lower(name))` where `archived_at is null` |
| icon | text null | ≤ 8 chars; the short code shown in the round badge, e.g. `LP` |
| grp | text not null | check in `ingredients, staff, occupancy, utilities, operating, admin, other, capex, not_expense` |
| needs_note | boolean not null default false | |
| sort_order | int not null default 0 | |
| archived_at | timestamptz null | categories are never deleted |
| created_at | timestamptz not null default now() | |

**Seeding.**
- `public.ensure_expense_categories(p_tenant_id uuid) returns void` is SECURITY DEFINER with `search_path ''`.
- The caller must be a store member (`app_user_belongs_to_store(p_tenant_id)`) or the service role. Anyone else gets 42501.
- It inserts the seed list (§4) with `on conflict do nothing` and is idempotent.
- It is granted to `authenticated` and `service_role` (never `anon`/`public`). The service role is recognised by having no `auth.uid()`.
- Readers call it once when a store has zero categories.

### `suppliers`

Table name is `suppliers`; the UI label is "Paid to". Reports Phase 3 (Deliveries) will reuse it.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null → tenants cascade | |
| name | text not null | 1–80; unique `(tenant_id, lower(name))` where `archived_at is null` |
| kind | text not null default 'supplier' | check in `supplier, landlord, utility, staff, government, other` |
| tin | text null | `^\d{9}(\d{3,5})?$` after the client strips dashes and spaces |
| default_category_id | uuid null → expense_categories | |
| phone | text null | ≤ 30 |
| note | text null | ≤ 200 |
| archived_at | timestamptz null | |
| created_by | uuid null | stamped |
| created_at | timestamptz not null default now() | |

### `expenses`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null → tenants cascade | |
| outlet_id | uuid null → outlets (NO ACTION, see note) | NULL = store-wide |
| category_id | uuid not null → expense_categories | same tenant (trigger) |
| supplier_id | uuid null → suppliers | same tenant (trigger) |
| paid_to_name | text null | ≤ 80, snapshot or free text |
| staff_user_id | uuid null | reserved for Pay staff (P2) |
| note | text null | ≤ 200; required (non-blank) when the category has `needs_note` |
| amount_cents | bigint not null | `> 0 and <= 1000000000` |
| spent_on | date not null | |
| paid_from | text not null | check in `drawer, cash, gcash, maya, bank, card, owner` |
| shift_cash_movement_id | uuid null → shift_cash_movements (NO ACTION) | required iff `paid_from = 'drawer'`; unique where `status = 'recorded'` |
| is_stock_purchase | boolean not null default false | |
| doc_type | text null | check in `vat_invoice, non_vat_invoice, acknowledgement, none` |
| invoice_no | text null | ≤ 40 |
| supplier_tin | text null | same format as suppliers.tin |
| vat_cents | bigint null | `>= 0 and < amount_cents` |
| ewt_cents | bigint null | `>= 0 and < amount_cents` |
| ewt_rate | numeric(5,2) null | 0–100 |
| form_2307_given | boolean not null default false | |
| status | text not null default 'recorded' | check in `recorded, void` |
| void_reason | text null | 1–200 when void |
| voided_by | uuid null | |
| voided_at | timestamptz null | `(status='void') = (voided_at is not null and void_reason is not null)` |
| replaces_expense_id | uuid null → expenses | |
| client_request_id | uuid null | unique `(tenant_id, client_request_id)` where not null |
| created_by | uuid null | stamped from `auth.uid()` for client roles |
| created_by_name | text not null | 1–80; client sends the display name (like `recorded_by_name`) |
| created_at | timestamptz not null default now() | stamped for client roles |
| updated_at | timestamptz not null default now() | |

**Indexes**
- `(tenant_id, spent_on desc) where status='recorded'`
- `(tenant_id, outlet_id, spent_on desc)`
- `(tenant_id, category_id, spent_on)`
- `(shift_cash_movement_id)`

**Guard trigger.** Client roles (`anon`, `authenticated`) get 42501 for:
- any UPDATE other than:
  - the editable fields: `note, supplier_id, paid_to_name, is_stock_purchase, doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, ewt_rate, form_2307_given, updated_at`;
  - `recorded → void`, done ONLY via `void_expense`;
- DELETE;
- `status = 'void'` on insert.

### `expense_receipts`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null → tenants cascade | |
| expense_id | uuid not null → expenses (NO ACTION) | |
| outlet_id | uuid null | copied from the expense by trigger |
| object_path | text not null unique | `<tenant_id>/<expense_id>/<uuid>.<ext>` in bucket `expense-receipts` |
| mime | text not null | `image/jpeg, image/png, image/webp, application/pdf` |
| bytes | int not null | `> 0 and <= 5242880` |
| uploaded_by | uuid null | |
| created_at | timestamptz not null default now() | |

- Rows are inserted by the service role only (from the upload route). There is no client INSERT, UPDATE or DELETE policy.
- SELECT follows the expense.
- Bucket `expense-receipts`: private, 5 MB, the four mimes above, NO storage policies.

## 3. Access (RLS, `authenticated`; anon gets nothing)

Helpers that already exist:
- `app_user_has_permission(tenant, key)`
- `app_user_may_reach_branch(tenant, outlet)`, where `NULL` outlet means store-wide accounts only
- `app_user_belongs_to_store(tenant)`
- `app_user_manages_cash(tenant)`

| table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| expense_categories | store member | `expenses` + `may_reach_branch(t, NULL)`; `system_key` must be null | same as insert (rename, icon, grp, sort, archive; not `system_key`, not `tenant_id`) |
| suppliers | store member | `expenses` + branch reach (NULL) | same |
| expenses | (`expenses` + `may_reach_branch(t, outlet_id)`) OR (`paid_from='drawer'` AND `created_by = auth.uid()`) | non-drawer: `expenses` + `may_reach_branch(t, outlet_id)`. Drawer rows: see the RPCs | `expenses` + branch reach, then the guard trigger |
| expense_receipts | follows the expense SELECT | none | none |

**Drawer link trigger.** BEFORE INSERT on `expenses` where `paid_from = 'drawer'`:
- the movement exists, has `kind = 'pay_out'` and the same tenant;
- `round(amount*100) = amount_cents`;
- `outlet_id` and `spent_on` are forced from the movement (Manila date of `created_at`);
- `status` is forced to `recorded`;
- the caller is authorized, by one of:
  - (a) the caller recorded that movement (`recorded_by = auth.uid()`) AND holds `pos` (or `expenses`);
  - (b) the caller holds `expenses` + branch reach (used to sort old pay-outs);
  - (c) the caller is the service role;
- the unique-while-recorded index prevents double links.

## 4. Seed categories

Format: `system_key | name | grp | icon | needs_note`.

```
ingredients        | Ingredients (Palengke)              | ingredients | IN | f
ice                | Ice (Yelo)                          | ingredients | IC | f
drinks             | Drinks & bar stock                  | ingredients | DR | f
packaging          | Packaging (Lalagyan)                | ingredients | PK | f
wages              | Salaries & wages (Sahod)            | staff       | SW | f
gov_contributions  | SSS / PhilHealth / Pag-IBIG         | staff       | GC | f
staff_meals        | Staff meals & allowances            | staff       | SM | f
thirteenth_month   | 13th month                          | staff       | 13 | f
rent               | Rent (Upa)                          | occupancy   | RE | f
electricity        | Electricity (Kuryente)              | utilities   | EL | f
water              | Water (Tubig)                       | utilities   | WA | f
lpg                | Gas / LPG                           | utilities   | LP | f
internet           | Internet & load                     | utilities   | NT | f
delivery_fees      | Delivery & rider fees               | operating   | DF | f
platform_fees      | Platform & payment fees             | operating   | PF | f
transport          | Transport (Pamasahe)                | operating   | TR | f
cleaning           | Cleaning & supplies                 | operating   | CL | f
repairs            | Repairs (Pagawa)                    | operating   | RP | f
marketing          | Marketing & ads                     | operating   | MK | f
permits            | Permits & taxes                     | admin       | PT | f
accounting         | Accountant & software               | admin       | AC | f
bank_charges       | Bank charges                        | admin       | BC | f
other              | Other                               | other       | OT | t
equipment          | Big purchase (equipment)            | capex       | EQ | f
owner_draw         | Owner took cash (Kinuha ng may-ari) | not_expense | OW | f
bank_deposit       | Bank deposit                        | not_expense | BD | f
loan_payment       | Loan payment                        | not_expense | LN | f
```

`sort_order` is the 0-based row index × 10 (0 … 260). The TypeScript copy lives in `src/lib/expenses/categories.ts` (`SEED_CATEGORIES`). A test asserts the TypeScript list equals the SQL seed.

## 5. RPCs (all `SECURITY INVOKER`, `search_path ''`, granted to `authenticated`)

**`record_drawer_expense(p_shift_id uuid, p_amount_cents bigint, p_category_id uuid, p_note text, p_supplier_id uuid, p_paid_to_name text, p_recorded_by_name text, p_client_request_id uuid) returns uuid`**
- **Idempotent:** if `(tenant, p_client_request_id)` already exists, it returns that id and inserts nothing.
- Inserts the `shift_cash_movements` pay_out row:
  - `amount = p_amount_cents / 100.0`
  - `reason = left(coalesce(nullif(btrim(p_note), ''), category name), 200)`
  - `recorded_by_name = p_recorded_by_name`
  - the existing policy and guard apply
- Then inserts the expense with `paid_from = 'drawer'` and `created_by_name = p_recorded_by_name`.
- Both inserts happen in one transaction. The RPC returns the expense id.
- Errors:
  - closed shift → the existing guard message;
  - category of another tenant → 42501;
  - `needs_note` with a blank note → 22023 with the message `note_required`.

**`sort_drawer_payout(p_movement_id uuid, p_category_id uuid, p_note text, p_supplier_id uuid, p_paid_to_name text, p_recorded_by_name text) returns uuid`**
- Links an EXISTING pay_out by inserting one expense. Nothing existing is updated.
- Requires `expenses`.
- Works on closed shifts too.
- Only an UNSORTED pay-out: a `pay_out` movement with NO linked expense row of ANY status (recorded or void). Otherwise 23505 `drawer_payout_already_sorted` (trigger `expenses_25_movement_once`; the only new row allowed on a used movement is `replace_expense`'s copy of that movement's voided row).

**`void_expense(p_expense_id uuid, p_reason text, p_actor_name text default null) returns void`**
- Who: `expenses` + branch reach may void any row. A cashier with `pos` may void a drawer expense THEY recorded while its shift is open ("Undo" after save; RLS policy `expenses_void_own_drawer`, which admits nothing but the void). Anyone else → 42501 (or P0002 when the row is not visible).
- The reason is 1–200 chars. Stamps `voided_by = auth.uid()` and `voided_at = now()`. Raises P0002 if no `recorded` row was affected.
- **Drawer rows keep the drawer honest.** Shift still OPEN → in the same transaction a `pay_in` of the same amount goes into that shift, `reason = left('Correction: ' || p_reason, 200)`, `recorded_by_name = p_actor_name`, else the caller's display name, else `'Staff'`. The normal `shift_cash_movements` policy applies (own shift, or `app_user_manages_cash`), so an `expenses` holder without cash management cannot void a drawer expense on someone else's open drawer (42501). Shift CLOSED → 22023 `drawer_shift_closed` (hint: use Fix / `replace_expense` to change the category instead).

**`replace_expense(p_expense_id uuid, p_reason text, p_patch jsonb) returns uuid`**
- Voids the old row and inserts a copy with `p_patch` applied and `replaces_expense_id = old.id`.
- Patchable keys: `category_id, amount_cents, spent_on, paid_from, outlet_id, note, supplier_id, paid_to_name, is_stock_purchase, doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, ewt_rate, form_2307_given`.
- For a drawer row, `amount_cents`, `paid_from`, `outlet_id` and `spent_on` are refused (22023 `drawer_locked`) when the patch CHANGES them (sending the same value is fine), and the new row keeps the same movement link. The unique index allows this because the old row becomes void first. A non-drawer row cannot be patched to `paid_from = 'drawer'` (22023 `drawer_locked`).
- Unknown patch keys → 22023 `unknown_patch_key`. The copy's `created_by_name` is the replacer's display name (fallback: the old row's).
- `replaces_expense_id` must point at a VOID row of the same store (42501 otherwise), and a void row has at most one replacement (unique, 23505).
- Returns the new id.

`ensure_expense_categories` is described in §2.

## 6. Store Activity

- New category: `expenses`.
- Kinds: `expense.recorded` and `expense.voided`. `expense.voided` is SENSITIVE (after-hours flag).
- New `subject_type`: `expense`.
- An AFTER INSERT trigger writes `recorded`; an AFTER UPDATE trigger writes `voided` on the `recorded → void` transition.
- The triggers are SECURITY DEFINER and swallow errors into a warning, matching the `shift_cash_movements` activity trigger.
- Titles:
  - "Recorded an expense: Gas / LPG ₱1,250"
  - "Voided an expense: Gas / LPG ₱1,250 (wrong category)"
- Update both `taxonomy.ts` copies, both `describe.ts` copies and `docs/plans/store-activity/contract.md`.

## 7. Permission key

- Key: `expenses`. Label: "Expenses". Description: "Record, fix and void expenses, manage categories and suppliers, see the expense book."
- Not opt-in, and nothing implies it.
- Admin section: `expenses` → `expenses`. The profit page is under `reports` and re-checks `expenses` + `costs` inside the page.
- App tabs: `expenses` → `expenses`; `profit` → `reports` (the screen re-checks).

## 8. Web routes

**Pages**
- `/[tenant]/admin/expenses`: the expense book.
- `/[tenant]/admin/reports/profit`: P3.

**Server actions** in `src/app/actions/expenses.ts`. Each returns `{ ok: true, data } | { ok: false, error }`:
- `recordExpenseAction`
- `voidExpenseAction`
- `replaceExpenseAction`
- `updateExpenseDetailsAction`
- `sortDrawerPayoutAction`
- `saveCategoryAction`
- `archiveCategoryAction`
- `saveSupplierAction`

**API routes** (bearer OR cookie session; same tenant; `expenses` key):
- `POST /api/expenses/receipts` (multipart: `expenseId`, `file`) → `{ id }`
- `GET /api/expenses/receipts/link?id=` → `{ url, expiresAt }`. 5-minute signed URL. Any caller who can SELECT the expense.
- `GET /api/expenses/export?from=&to=&format=csv|xlsx`

## 9. App (webnegosyo-app)

- Reads and writes go directly through supabase-js under RLS, using the RPCs above.
- Receipts use the routes above with `Authorization: Bearer`.
- Offline: every insert carries a `client_request_id` generated on the device.

## 10. Implementation notes (DB agent, 2026-10-21)

These refine §2–§6; the migrations `20261022120000/120100/120200` are the reference and `tests/sql/run-expenses.cjs` pins them.

- **NO ACTION instead of RESTRICT** on every FK a tenant deletion cascades through (`expenses.outlet_id`, `.shift_cash_movement_id`, `.category_id`, `.supplier_id`, `.replaces_expense_id`, `expense_receipts.expense_id`, `suppliers.default_category_id`). RESTRICT is checked mid-cascade and can make deleting a store fail; for a direct DELETE they behave the same.
- **Errors.** 22023: `note_required`, `reason_required`, `recorded_by_name_required`, `amount_out_of_range`, `drawer_locked`, `unknown_patch_key`, `drawer_amount_mismatch`, `not_a_pay_out`, `drawer_movement_required`, `spent_on_in_future`, `spent_on_too_old`, `drawer_shift_closed`. 42501: another store's category/supplier/branch/pay-out, a missing `expenses` key or branch reach, any immutable-field UPDATE, DELETE. P0002: `shift_not_found`, `movement_not_found`, `expense_not_found`. 23505: double link / `drawer_payout_already_sorted`, reused `client_request_id`, second replacement.
- **Date window** (`spent_on` ≤ Manila today + 1, ≥ today − 400) applies to client-role inserts of non-drawer rows. The service role (imports) is not limited.
- **Void rows are frozen**: no UPDATE at all, editable fields included.
- **Unsorted pay-outs** (readers, the "Sort old pay-outs" list): `shift_cash_movements` with `kind = 'pay_out'` and NO `expenses` row of ANY status pointing at them. A voided drawer expense's pay-out is not unsorted: either `void_expense` put the cash back with a `Correction:` pay_in, or `replace_expense` re-filed it.
- **Drawer void**: see §5 `void_expense` — open shift = pay_in correction in the same transaction; closed shift = 22023 `drawer_shift_closed`. `replace_expense` never touches the drawer.
- **Service role** may call `sort_drawer_payout` / `void_expense` without holding a staff key (it is the server). All RPCs are granted to `authenticated` and `service_role`.
- `expense_receipts.object_path` is checked: `<tenant_id>/<expense_id>/<uuid>.(jpg|jpeg|png|webp|pdf)`.
- **Activity amounts** are signed like the rest of Store Activity: `expense.recorded` = −amount, `expense.voided` = +amount. Summary carries `title`, `categoryName`, `paidFrom`, `spentOn` (+ `replacesExpenseId`). The activity `describe.ts` (web + app) uses the `money` icon for the category (no new app glyph) and `cancel` for a void.
- **Permission**: `app_user_has_permission` needs NO change for `expenses` (owner = every key; `permissions IS NULL` = every non-opt-in key; a held key matches by name). Verified against the live body 2026-10-21.

