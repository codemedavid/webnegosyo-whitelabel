# Expenses & Profit — Product Plan

**Status:** APPROVED 2026-10-21 — owner replied "lets go now" (all ten §10 defaults accepted). Building in worktree `.claude/worktrees/expenses` on `feat/expenses`.
**Surfaces:** merchant app (`webnegosyo-app`) and web admin (`/[tenant]/admin`). The desktop POS only gets a registry copy.
**Backend rule:** platform Supabase first. Expenses live on the platform DB for every store. Profit is for platform-backend stores only, the same rule as Sales reports.

This plan merges seven research tracks:
- market research (Toast, Square, Loyverse, StoreHub, Eats365, Odoo, MarginEdge, QuickBooks, Khatabook…)
- UX research
- restaurant finance and PH compliance
- cash-drawer code map
- inventory/reports code map
- staff/permissions/navigation code map
- live platform DB probe (read-only)

Tags: **[MKT] [UX] [FIN] [DRAWER] [INV] [STAFF] [DB]**.

---

## 0. The pitch

The cashier pays the ice man from the till. They tap **Pay an expense** → **↻ Ice ₱120** → **Save**: three taps. The drawer total drops by ₱120, and the expense lands under "Ice (Yelo)" in the owner's book. Nobody types it twice.

At night the owner opens **Profit** and reads one sentence:

> **October so far: Sales ₱182,400 − Ingredients ₱64,100 − Expenses ₱38,410 = Profit ₱79,890 (44%).**
> ⚠ You haven't recorded Rent this month, so profit looks higher than it is. **[Record]**

Every peso is counted once. Nothing is deleted, only voided with a reason.

---

## 1. What we found

### 1.1 Already there [DRAWER][DB]

**Drawer pay-outs are the only spending record today.**
- `shift_cash_movements.kind = 'pay_out'` (`20261001120000_cash_drawers.sql:238`).
- Each row has an amount in numeric pesos and a free-text reason (required, max 200).
- The table is append-only, accepts rows only while the shift is open, and stamps the actor on the server.
- The app writes it straight from the client (`webnegosyo-app/lib/cash-drawer-service.ts:223`) through `CashMoveSheet` (Amount + "What for?").

**Live data proves the need [DB].** There are 14 real pay-outs, with reasons "ice", "ICE", "sprite", "meal", "Food Delivery", "Gcash", plus staff first names (wages or cash advances). Owners are already logging expenses. They just can't add them up.

**Inventory has its own money trail [INV].**
- A `receive` movement carries an optional frozen `unit_cost`. Only 29 of 780 receives have a cost.
- The `costs` key gates the price field.
- There is no supplier, invoice, delivery header or "paid by" yet. Reports Phase 3 (Deliveries) plans `suppliers` + `purchase_receipts`.

**COGS foundations are done [INV].**
- Frozen cost per movement (`20261012180000`).
- `order_item_costs` (dish cost at sale).
- One sales truth (`src/lib/reports/sales-model.ts`) with SQL twins (`report_sales_summary`…).
- Reports Phase 5 (Profit) is planned but not built, and it does not mention expenses.

**Shifts track the drawer, not labor time [STAFF].**
- `staff_shifts` has server-stamped open and close times, but only `pos` holders open one. Cooks never clock in.
- No wage, rate or salary field exists anywhere.

### 1.2 Gaps we'll close on the way

| Gap | Where |
|---|---|
| The web never shows pay-outs. `toStaffShift` keeps only `collected` | [DRAWER] `src/lib/staff-activity/staff-activity-service.ts:159` |
| Shift history shows "₱X paid out" with no reasons | [DRAWER] `ShiftHistoryList.tsx:120` |
| A palengke run paid from the till is one pay-out, and stock received is a separate unlinked row. Two records with no link between them | [INV] |
| The daily report prices COGS at today's cost | [INV] `daily-report.ts:315`. Profit uses frozen cost |
| The desktop POS has no drawer at all | Out of scope. Noted |

### 1.3 What the market teaches [MKT]

- **Loyverse and Square record pay-outs as free text.** You can't get a period total or a P&L. The most common complaint is "you have to look day by day." This is our biggest opening.
- **Toast is the best drawer model.** A pay-out reason is required and maps to a ledger account. Its flaw: you can undo only while the drawer is open.
- **StoreHub and Eats365** split typed pay-outs into Expense / Buy inventory / Drop / Other. That split keeps bank deposits out of expenses.
- **Odoo** turns a POS cash-out into an expense with "Paid by: Company / Employee (reimburse)."
- **MarginEdge** uses category types, so COGS purchases never count twice.
- **QuickBooks** distinguishes Scheduled bills (fixed) from Reminder bills (variable amount).
- **Monefy and Khatabook** set the speed bar: two to three taps per entry.
- **Complaints to avoid:** OCR that writes wrong numbers, records that disappear at day close (iChef), counting things twice (QBO, Loyverse), and no "who paid" field.

---

## 2. Product decisions

### 2.1 The core model: one expense record, many ways in

An **expense** is one row. Every way of spending money creates it:

| Way in | Who | Paid from | Creates |
|---|---|---|---|
| Drawer → **Pay an expense** | cashier on shift (`pos`) | that drawer (locked) | `shift_cash_movements` pay_out **and** expense, in one transaction |
| **＋ Expense** (app Home / Expenses, web) | owner / `expenses` holder | Cash on hand · GCash · Maya · Bank · Card · Owner's pocket | expense only |
| **Mark bill paid** | owner | any | expense linked to the bill |
| **Pay staff** | owner | any | expense in Labor, linked to the staff member |
| **Sort an old pay-out** (from older app builds) | owner | that drawer | expense linked to the existing pay-out (nothing is updated) |
| Owl "nag-gastos ako ng 850 sa palengke" (Phase 5) | owner | — | a proposal; the owner taps Confirm |

**Not everything that leaves the drawer is an expense [MKT][FIN].** A pay-out can be marked as one of these "not an expense" kinds:
- **Owner took cash** (*Kinuha ng may-ari*)
- **Bank deposit**
- **Loan payment**

These kinds still balance the drawer and show in Cash flow. They never reduce Profit. Mid-shift pickups stay the existing `collect`.

### 2.2 Count every peso once: ingredients [FIN][INV]

**Profit = Net sales − Ingredient cost − Expenses.** Ingredient cost depends on whether the store tracks stock.

| Store | Ingredient cost in Profit | Ingredient *purchases* |
|---|---|---|
| **Tracks stock** (recipes + sale movements in the window) | Recipe COGS at frozen cost + waste/count losses + ingredient expenses that **did not go into stock** (e.g. ice, if it isn't an inventory item) | Shown in **Cash flow only**. Never subtracted again |
| **Doesn't track stock** | Every Ingredients-group expense (purchases basis) | Same rows |

The "doesn't track stock" figure is labelled *"Estimate: based on what you bought, not what you used."*

- **One question, asked only in stores that track stock:** when an Ingredients-group expense is saved, *"Did this go into your stock count?"* (Yes / No). Yes sets `is_stock_purchase = true`. Phase 3 can link the expense to the actual receive rows.
- Coverage is always shown: *"Ingredient cost is estimated: 9 of 31 dishes have no recipe."*

### 2.3 Payroll: honest v1 [FIN][STAFF]

**v1 is Pay staff.**
- Pick a staff member (or type a name, for helpers who have no account), the period, and the amount.
- Optionally break it out: employer SSS / PhilHealth / Pag-IBIG share, and 13th month.
- Each line becomes a Labor expense.
- Labor % and **prime cost** (ingredients + labor) appear on Profit.

**Deferred (Phase 5):**
- staff pay rates
- a real time clock that doesn't require a drawer
- an "estimated labor from hours" line

**Never in this product:** premium and holiday computation, withholding on compensation, contribution remittance, payslips. Those carry legal liability and change yearly. We export for the accountant instead.

### 2.4 Receipts

- A photo is optional, taken in-app or picked from the gallery.
- Photos go in a **private** Supabase bucket `expense-receipts`, using the Senior/PWD ID-photo pattern: no storage policies, service-role upload/link routes after a session check, and short-lived signed URLs. Receipts show supplier TINs and names, so they are kept off the public ImageKit CDN.
- **No OCR in v1.** Phase 5 adds "Read receipt for me". The amount it reads appears only as a suggestion chip ("Photo says ₱1,248.50 — Use this"). It never auto-fills or auto-saves [UX][MKT].

### 2.5 Controls without friction [FIN]

- **Append-only.**
  - Money, date, branch, category and source never change after saving.
  - A correction is **void + replacement** (`replaces_expense_id`), and the history shows both.
  - Notes, supplier and invoice fields stay editable, and every edit is logged.
- **A drawer expense can't be voided away.** The cash really left the drawer. It can only be re-sorted: void + new row with a different category (possibly "not an expense").
- **Flags, not approval gates (v1):**
  - "No receipt" above ₱1,000 (store setting)
  - possible duplicate (same supplier + invoice number, or same amount + category within 2 days)
  - round-number "Other"
  - after-hours void
- Flags appear in a **Needs a look** filter and in Store Activity. Approval-before-pay is deferred, because drawer cash has already left by the time it would be asked.
- Store Activity kinds `expense.recorded`, `expense.voided` (sensitive → after-hours flag), `expense.sorted`.

### 2.6 PH compliance: there, folded away [FIN]

Under **Invoice details (for your accountant)**, every field is optional:
- document type (VAT invoice / non-VAT invoice / acknowledgement / none)
- invoice number
- supplier TIN
- VAT: only for VAT-registered stores (`store_tax_profiles`), auto 12/112 with override
- EWT withheld + "2307 given": prompted on Rent and Professional fees

The **accountant export** (CSV/XLSX) has one row per expense: Date · Branch · Category · P&L line · Paid to · TIN · Doc type · Invoice no. · Gross · VATable · Input VAT · EWT · Net paid · Paid from · Status · Recorded by · Receipt link · Notes. A monthly summary sheet comes with it.

We are **not** the BIR book of accounts. We hand clean data to the bookkeeper.

### 2.7 Cut or deferred

| Item | Reason |
|---|---|
| Bank feeds | Not available in PH for SMBs |
| Multi-step approval chains | Overkill for 1–3 staff stores |
| Budgets | Later; bills cover the real need |
| Splitting rent across branches by sales share | Phase 5; v1 records store-wide rent with `outlet_id NULL` |
| Accrual "spread over N months" (annual permit, equipment) | Phase 5; v1 has "Big purchase (equipment)" outside operating profit |

---

## 3. Categories (seeded, editable)

Each tenant gets this list. Owners can rename, reorder, add and archive categories. A category that has been used is never deleted. The hidden **group** drives Profit, so the owner never sees accounting words.

| Group (P&L line) | Default categories |
|---|---|
| **Ingredients** (COGS) | Ingredients (Palengke) · Ice (Yelo) · Drinks & bar stock · Packaging (Lalagyan) |
| **Staff** (Labor) | Salaries & wages (Sahod) · SSS / PhilHealth / Pag-IBIG · Staff meals & allowances · 13th month |
| **Rent & utilities** (Occupancy + Utilities) | Rent (Upa) · Electricity (Kuryente) · Water (Tubig) · Gas / LPG · Internet & load |
| **Running the store** (Operating) | Delivery & rider fees · Platform & payment fees (Grab, foodpanda, GCash) · Transport (Pamasahe) · Cleaning & supplies · Repairs (Pagawa) · Marketing & ads |
| **Admin** | Permits & taxes · Accountant & software · Bank charges |
| **Other** | Other (note required) · Big purchase (equipment), shown below operating profit |
| **Not an expense** (cash flow only) | Owner took cash · Bank deposit · Loan payment |

Recurring defaults are offered when bills are set up: Rent, Electricity, Water, Internet, Salaries (15th/30th), SSS/PhilHealth/Pag-IBIG.

---

## 4. Information architecture [UX]

### 4.1 Merchant app: no new bar slot

The bar stays Home · Orders · POS · Reports · Manage.

| Place | Change |
|---|---|
| **Drawer screen** (`pos-sales.tsx` → `MyShiftCard`) | "Cash in / out" keeps Pay in / Take out. The **Pay out** tab becomes **Pay an expense**, which opens the expense sheet with "From: Cashier 1 drawer 🔒". "Take out cash" holds the not-an-expense kinds. The shift close summary lists *"Paid for expenses ₱1,450 (3)"* by category |
| **Home** | **＋ Expense** quick action (users with `expenses`). A **Bills** strip when something is due ≤ 3 days or overdue (Phase 4) |
| **Reports hub** | New top section **Money**: **Profit** · **Expenses**. Expenses has tabs *List · Bills*. A gear opens Categories |
| **Team → staff page** | **Pay staff** button + "Paid this month" (Phase 2) |

### 4.2 Web admin

| Place | Change |
|---|---|
| **Sidebar** | New **Money** group: **Expenses** (`/admin/expenses`) · **Bills** (`/admin/expenses/bills`) · **Profit** (`/admin/reports/profit`, the route Reports Phase 5 already planned, so we build that phase here) |
| **Reports overview** | A Profit card linking in |
| **Staff → shift history** | Shows pay-outs with category and reason (fixes the gap in §1.2) |

Division of labour: the **phone is where money gets recorded**. The **web is where the owner reviews, bulk re-sorts, attaches receipts and exports**.

---

## 5. Screens [UX]

### 5.1 App: Add expense sheet (amount first)

A full-height bottom sheet, top to bottom:

1. **Header:** "New expense" + a paid-from pill: `From: Cash on hand ▾`, or `From: Cashier 1 drawer 🔒` when opened from the drawer.
2. **Amount:** 40pt, tabular figures, "₱" prefix. Uses our own keypad, never the OS keyboard.
3. **Repeat row:** up to 4 chips with the last and most frequent category + amount pairs, e.g. `↻ Ice ₱120`, `↻ LPG ₱1,250`, `↻ Pamasahe ₱80`. One tap fills both fields.
4. **Category chips:** a 2-row grid with the top 8 (ranked by frequency, nudged by time of day), then **More…**. The selected chip is filled and shows a ✓.
5. **Folded row:** 📷 Receipt · ✎ Note · 📅 Today ▾ · 🏷 Paid to. *Invoice details* appears only in back-office mode.
6. **Keypad:** 1–9 · 00 · 0 · ⌫, with 64px keys and haptics. Whole pesos by default; long-press `00` for centavos.
7. **Primary button:** **Save ₱1,250**. It is disabled until there is an amount and a category, and the label always shows the amount.

**After Save:**
- A snackbar shows "Saved · LPG ₱1,250 · **Undo**" for 6 s. Undo voids the expense, with reason "undo".
- The sheet stays open, empty, for the next entry (palengke runs come in batches).

**Tap budget:** a repeat expense takes 3 taps. A new one is type amount → chip → Save.

**Rules:**
- Drawer source: can't exceed what the drawer should hold. Reuses `validateCashMove`: *"That's more than this drawer should have. Count it first."*
- Ingredients group, in a store that tracks stock: one inline Yes/No row, *"Did this go into your stock count?"*
- "Other": note required.

### 5.2 App: Expenses list

- **Top:** a month picker, the month total (**Gastos this month ₱38,410**), and filter chips: Category · Paid from · Branch · Has receipt · **Needs a look**. A 🔍 icon searches note, supplier and amount.
- **Body:** grouped by day with sticky headers ("Today · ₱1,450").
- **Rows:** category icon · title (note, or the category) · "Drawer · Ana · 9:42 AM" · amount on the right. Small 📎 and 🔁 icons. Drawer rows carry a **till badge**.
- **Unsorted pay-outs** (from older builds): a banner at the top, "4 drawer pay-outs to sort". Each opens the sheet pre-filled with amount and reason, plus a keyword suggestion ("ice" → Ice (Yelo)).
- **Detail screen:**
  - amount, fields, receipt (tap to zoom)
  - a **History** timeline ("Recorded by Ana from Cashier 1 drawer · Voided by Owner: wrong category · Replaced by …")
  - actions: **Fix** (void + replace, prefilled), **Void** (reason required), **Add receipt**

### 5.3 App + web: Profit

**The sentence card:**

```
October so far                                   [This month ▾] [All branches ▾]
Sales (Benta)                         ₱182,400
− Ingredients (Sangkap)                ₱64,100   ⓘ from recipes · 92% of dishes
− Expenses (Gastos)                    ₱38,410
─────────────────────────────────────────────
= Profit (Kita)                        ₱79,890   ✓ 44% of sales
```

**Trust strip.** It appears only when relevant, and every row is actionable:
- "⚠ No Rent recorded this month. Profit looks higher than it is. **[Record]**" This fires when a bill exists, or last month had that category, and nothing is recorded yet.
- "Ingredient cost is estimated: 9 dishes have no recipe. **[Add recipes]**"
- "3 expenses waiting to sync."
- "4 drawer pay-outs not sorted yet. **[Sort]**"

**Below the card:**
- **Prime cost bar:** "Ingredients + Staff = 43% of sales · most cafés land at 55–65%". The term "prime cost" sits behind ⓘ.
- **Ratios:** food %, staff %, rent %.
- **Where the money went:** a ranked bar list by category (no pie), tappable into the filtered list.
- **Trend:** 6 months, sales as a line and profit as bars. Incomplete months are drawn hollow.
- **Cash flow tab:** money in (collected) vs money out (expenses + stock purchases + owner took cash + loan payments). This is where purchases appear.

**Period:** This month · Last month · This week · Custom (≤ 93 days, same as the report RPCs).

**Locked states:**
- Without `costs`: the Ingredients line is hidden and the card says "Ask the owner for cost access to see profit."
- Without `expenses`: the page is not offered at all.

### 5.4 Web: Expenses

- **Table:** sticky day groups; columns Date · Category · Note / Paid to · Paid from · By · 📎 · Amount (right-aligned, tabular).
- **Saved views:** All · Drawer pay-outs · No receipt · Needs a look · Unsorted.
- **Multi-select:** bulk re-sort (void + replace with one reason) and export.
- **Row click:** a right-side drawer with detail, history and receipt preview.
- **Add expense dialog:** keyboard-first. Type the amount → Tab → type "kur" → Enter → ⌘Enter saves. Drop a photo or PDF anywhere on the page to attach it.
- **Export:** CSV/XLSX in the accountant layout (§2.6), using the existing CSV helper (BOM, CRLF, formula guard).

### 5.5 Bills (Phase 4)

- **Rows:** name · amount (or "about ₱4,800" for variable bills) · due date · status pill.
- **Status pills, sorted overdue → today → upcoming → paid:**
  - Due in 3 days (neutral 🕒)
  - Due today (amber)
  - **Overdue · 2 days** (red outline ⚠ + text)
  - Paid Oct 3 (muted ✓)
- **Mark paid** opens the expense sheet pre-filled. Variable bills open empty with the hint "Last month ₱4,612".
- **Swipe actions:** Mark paid · Skip this month · Edit.
- **Suggestions:** "You paid Rent ₱15,000 around the 5th for 2 months. Make it a bill?"
- **A bill is a reminder, not spending.** It never touches profit until it is paid.

### 5.6 Visual language [UX]

- **Calm and neutral.** Money out uses normal ink with a "−" and a category icon, **never red**. Red is reserved for overdue and for a loss, always paired with an icon and a word ("Lugi · −₱3,200"). Profit is deep green with ✓.
- **Numbers:**
  - tabular figures everywhere (`tabular-nums`, RN `fontVariant: ['tabular-nums']`)
  - right-aligned, always "₱" with separators
  - decimals in lists only when they aren't zero; always in detail and export
- **One hero number per screen.** Size, not colour, carries importance.
- **Paid-from icons:** till, wallet, bank. GCash and Maya appear as text, not logos.
- **Surfaces:** white cards, hairlines, 12–16px radius, one brand accent. No gradients or confetti in money views. Owl appears only in empty states and the sorry state.
- **Copy:** English first with Filipino in parentheses on categories ("Ice (Yelo)"). Taglish helper lines where it helps ("Kung may binayaran ka, idagdag dito.").
- **Accessibility:**
  - every amount has a spoken label
  - 4.5:1 contrast
  - colour is never the only signal
  - font scale to 200% (the keypad shrinks before the amount does)

### 5.7 Empty and first-run states

- **Profit, first open:** "Profit = Sales − Ingredients − Expenses. We already know your sales. Add your first expense and we'll do the math." Buttons: **[Add expense]** · **[Set up monthly bills]**. The second opens one screen of toggles (Rent, Electricity, Water, Internet, Salaries), each with an amount.
- **Empty month:** "No expenses recorded for October." The Profit card shows a partial-data warning, because empty can mean missing.

---

## 6. Data model [DB]

Migration `2026102212xxxx_expenses.sql`, plus `…_expenses_drawer_rpc.sql` and `…_expense_receipts_bucket.sql`. They are applied via MCP and probed per role before the phase counts as done.

### 6.1 Tables

```sql
expense_categories (
  id, tenant_id NULL=system, system_key, name, emoji/icon,
  grp text check in ('ingredients','staff','occupancy','utilities','operating',
                     'admin','other','capex','not_expense'),
  needs_note bool, sort_order, archived_at
)
-- Each tenant gets its own copies of the seed rows, created on first use by
-- ensure_expense_categories(tenant); NOT a trigger on tenants.

suppliers (
  id, tenant_id, name, kind ('supplier','landlord','utility','staff','government','other'),
  tin, default_category_id, phone, note, archived_at, created_by, created_at
)
-- Named `suppliers` on purpose: Reports Phase 3 (Deliveries) reuses this
-- table instead of creating its own. UI label: "Paid to".

expenses (
  id, tenant_id, outlet_id NULL = store-wide,
  category_id, supplier_id, paid_to_name (snapshot / free text), staff_user_id (Pay staff),
  note ≤200,
  amount_cents bigint >0 ≤ 1e9,
  spent_on date (Manila business date the cost belongs to),
  paid_from ('drawer','cash','gcash','maya','bank','card','owner'),
  shift_cash_movement_id UNIQUE (required iff paid_from='drawer'),
  bill_id, is_stock_purchase bool default false,
  doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, ewt_rate, form_2307_given,
  status ('recorded','void'), void_reason, voided_by, voided_at, replaces_expense_id,
  client_request_id (unique per tenant, offline retries),
  created_by, created_by_name, created_at
)

expense_receipts (
  id, tenant_id, expense_id, outlet_id (copied), object_path UNIQUE,
  mime, bytes ≤ 5 MB, uploaded_by, created_at
)

expense_bills (Phase 4)
  id, tenant_id, outlet_id, name, category_id, supplier_id,
  repeat ('weekly','monthly','twice_monthly','quarterly','yearly'), anchor_days int[],
  amount_cents NULL = varies, next_due_on, remind_days_before,
  status ('active','paused','ended')
```

**Money.** Integer centavos, matching `src/lib/reports/money.ts`. `shift_cash_movements` stays in numeric pesos. The link trigger checks `round(amount*100) = amount_cents`.

**Indexes.**
- `(tenant_id, spent_on desc) where status='recorded'`
- `(tenant_id, outlet_id, spent_on desc)`
- `(tenant_id, category_id, spent_on)`
- partial unique `(bill_id, spent_on)`

Volumes are tiny (tens to hundreds of rows per store per month), so these are enough.

### 6.2 RLS: tested as the role that runs the query

| Table | anon | `authenticated` |
|---|---|---|
| categories / suppliers | none | SELECT: store member. Write: `expenses` + store-wide (`app_user_may_reach_branch(t, NULL)`) |
| expenses | none | SELECT: `expenses` + `app_user_may_reach_branch(t, outlet)`. A cashier sees their own shift's drawer expenses through the RPC's read. INSERT: `expenses` + branch reach + `paid_from <> 'drawer'`. Drawer rows come only through the RPC (below) |
| expenses UPDATE | none | Guard trigger (42501). Allows only `recorded → void` (stamps voider/time, needs a reason) and edits to note, supplier, invoice and tax fields. Everything else is immutable. No DELETE |
| receipts | none | Rows follow the expense. The bucket has **no** policies; routes use the service role after a session check |

**Drawer RPC: `record_drawer_expense(shift_id, amount_cents, category_id, note, supplier_id, client_request_id)`.**
- It is **SECURITY INVOKER**. The existing `shift_cash_movements` insert policy and guard keep applying unchanged: open shift, own drawer or manages cash, outlet copied, actor stamped.
- It inserts the pay_out row, then the expense, in one transaction.
- A narrow policy lets `pos` holders insert `paid_from='drawer'` rows. A BEFORE INSERT trigger then:
  - checks the linked movement is a pay_out in the same tenant, recorded by the caller (or the caller manages cash), with the same amount
  - copies outlet and `spent_on` from the movement
  - forces status `recorded`

  The unique link blocks double-linking. A direct insert can't achieve anything the RPC can't. This is the inventory-ledger pattern.
- **Sorting old pay-outs** uses the same RPC path with an existing movement id (`sort_drawer_payout`). It inserts only the expense, so no existing row is updated (no live data repairs).

**Activity.**
- Kinds `expense.recorded` / `expense.voided` / `expense.sorted`, a new `money` category, `subject_type 'expense'`.
- Redefine `store_activity_category_of` / `is_routine`, update both `taxonomy.ts` copies + `describe.ts` + `contract.md`, and fix the taxonomy test so it reads the newest definition.

### 6.3 Permission key: `expenses`

- One new key: **`expenses`** = record, see, fix and void expenses, manage categories, suppliers and bills, pay staff.
- Drawer expenses need only `pos`, the same as today's pay-outs. That keeps cashiers working without seeing the books.
- **Profit** needs `reports` + `expenses` + `costs`. The owner has all three. For a staff account it's an explicit grant.
- The key goes into four registries in lockstep (web, app, desktop, `manage-staff/staff-core.ts`, then redeploy) + both label maps + `ADMIN_SECTION_PERMISSIONS` (`expenses` → `expenses`) + app `TAB_PERMISSIONS` + a new full definition of `app_user_has_permission`.
- Production rejects unknown keys, so the key ships with the code (runbook as in `docs/testing/permission-keys.tdd.md`).

---

## 7. Architecture

| Layer | Where | What |
|---|---|---|
| Pure engine | `src/lib/expenses/` | `categories.ts` (seed + groups), `validation.ts` (zod, shared with the app copy), `flags.ts` (needs-a-look rules), `sort-suggest.ts` (reason → category keywords), `export.ts` (accountant columns) |
| Profit engine | `src/lib/reports/profit-model.ts` + `cogs.ts` | Net sales from `sales-model` (never a new formula). Ingredient cost per §2.2 with coverage. Ratios, trust-strip findings. Centavos via `money.ts` |
| SQL twin | `report_profit_summary`, `report_profit_by_period`, `report_expenses_by_category` | `reporting.assert_access` + `expenses` + `costs`, ≤93 days, INVOKER, `RETURN QUERY EXECUTE … USING`, child rows via `= any(array(select …))`. A parity property test against the TS engine to the centavo, via PGlite |
| Read layer | `src/lib/expenses/read/`, `src/lib/reports/read/report-rpc.ts` | The caller's session client only. Page through the 1000-row cap |
| Web writes | `src/app/actions/expenses.ts` → `src/lib/expenses/expense-service.ts` | `verifyTenantPermission`, zod, zero-row checks (RLS refusals are silent) |
| Receipts | `POST /api/expenses/receipts` · `GET /api/expenses/receipts/link` | The ID-photo pattern: private bucket, signed URLs, per-person rate limit |
| App | `webnegosyo-app/lib/expenses/` + `components/expenses/` + `app/(main)/expenses.tsx`, `profit.tsx` | `useResource` + `invalidateResource`. An offline queue modelled on `lib/offline/stock-call-queue.ts` with `client_request_id`. A photo queue modelled on `lib/gov-id-photos/photo-queue.ts`. `expo-image-picker` / `expo-camera` are already in the binary, so this is **OTA-able** |
| Owl (Phase 5) | `src/lib/assistant/tools/reads/expenses.ts`, `propose/expense.ts` | `get_expenses`, `get_profit`, `propose_expense`. Extend `assistant_actions_kind_check`, `ACTION_PERMISSION`, `execute.ts`, both presentation maps and `links.ts`. Append at the end of `ASSISTANT_TOOLS` (cached prefix) |
| Bills push (Phase 4) | `merchant_notifications` | Widen `kind` (`bill_due`, `bill_overdue`), make item columns generic, add a per-kind read gate (`expenses`), push wording on both sides + parity test, and a daily Vercel cron |

---

## 8. Phases

Each phase ends with: tests green, lint clean, migrations applied **and probed** on platform, a signed-in check on a demo store, and a code review.

| # | Phase | Ships | Depends |
|---|---|---|---|
| **0** | **Foundations** | Migrations (categories, suppliers, expenses, receipts bucket, guard + link triggers, `record_drawer_expense` + `sort_drawer_payout`, activity kinds). `expenses` key in 4 registries + SQL. Pure engine + zod. PGlite SQL runner `tests/sql/run-expenses.cjs` covering every role | — |
| **1** | **Capture** | **App:** Add-expense sheet, drawer "Pay an expense" via the RPC, "Take out cash" kinds, Expenses list + detail, unsorted pay-outs, offline queue, receipt photos. **Web:** `/admin/expenses` table, add dialog, detail drawer, void/fix, categories dialog, CSV/XLSX export, shift history showing pay-outs | 0 |
| **2** | **Staff pay** | Pay staff (app staff page + web staff page). Labor lines incl. employer share and 13th month | 1 |
| **3** | **Profit** | SQL twins + `profit-model` + parity test. Web `/admin/reports/profit` + app Profit screen: sentence card, trust strip, prime cost, ratios, category bars, trend, cash flow. Reports overview card | 1 (2 for labor %) |
| **4** | **Bills** | `expense_bills`, Bills tab (app + web), Home strip, "make it a bill" suggestions, bell push for due/overdue | 1 |
| **5** | **Smart & deep** | Owl tools. Receipt reading (suggestion-only). Staff pay rates + clock-in for non-cashiers → estimated labor. Spread-over-months. Rent split across branches. Expense ↔ delivery link (with Reports Phase 3) | 3, 4 |

**Suggested first release: Phases 0 + 1 + 3.** Owners get capture and the profit number together, which is the "aha".

**Build team (seven parallel agents, on a `feat/expenses` worktree):**
1. DB/SQL + probes
2. Web engine + read layer
3. Web UI
4. App UI
5. App data / offline / photos
6. Profit SQL + parity
7. QA + security review

---

## 9. Testing

- **SQL (PGlite, the real migration file):**
  - anon sees and writes nothing
  - staff without `expenses` → 0 rows
  - a branch-locked account sees only its branch
  - a cashier can record a drawer expense only on their own open shift, and nothing else
  - a direct drawer-row insert without a movement is refused
  - amount mismatch refused
  - double link refused
  - void needs a reason; money fields are immutable; DELETE refused
  - every check asserts **affected rows**, never just "no error"
- **Unit:** categories seed, validation, flags, sort suggestions, export columns, keypad parsing (`₱1,250`, centavos), offline queue retry and dedupe.
- **Property:**
  - `profit-model` vs SQL twin to the centavo over `reportOrdersArb` + random expenses
  - Σ by category = Σ by branch = total
  - not-expense kinds never change profit
  - stock purchases never counted twice
- **Contract:** permission registry parity (4 copies), admin-section guardrail, hubs / tab-visibility, activity taxonomy parity, no hard-coded red on expense rows.
- **Live (opt-in):** `EXPENSES_LIVE=1` round trip on the demo store (record → drawer link → void → profit reconciles → cleanup).
- **E2E:** add expense from the drawer, then see it on the web list and in Profit.

---

## 10. Decisions for the owner (defaults in **bold**; reply "go" to accept all)

1. **One permission key `expenses`.** Cashiers record drawer expenses with their existing `pos` access.
2. **Profit needs reports + expenses + costs** (owner by default).
3. **Ingredients rule of §2.2:** stores that track stock ask "Did this go into your stock?". Stores that don't use purchases as an estimate.
4. **Payroll v1 = record pay** (incl. employer share and 13th month). Hours × rate comes later.
5. **Receipts optional, private storage, no OCR in v1.** Flag "no receipt" above **₱1,000**.
6. **No approval gates in v1.** Use flags + Store Activity instead.
7. **Old free-text pay-outs are sorted by the owner from an "Unsorted" list.** No automatic backfill.
8. **Sidebar group "Money"** on the web. **Reports hub → Money** in the app. No new bar slot.
9. **First release = Phases 0 + 1 + 3.** Then Staff pay, then Bills.
10. **`suppliers` table built now** and shared with the future Deliveries phase.
