# Bills to pay — build contract

Approved by the owner 2026-10-22 with every recommendation: name "Bills to pay", always confirm (no
auto-log), no drawer payments in v1, phone reminders first, no ingredient bills. Plan + mockups:
`docs/plans/expenses/recurring-bills.md`, https://claude.ai/artifact/8dPWahKqrrtyiHi1RkS5JS.
Every agent reads this file first. Change it before changing a contract.

## 1. Rules that never bend

- A bill is a REMINDER. Spent, Profit and every report count only expenses. A bill never writes money.
- Paying = one ordinary expense row (`expenses`) carrying `bill_id` + `bill_due_on`. At most one
  recorded expense per (bill, due date). Paying never edits the bill.
- Editing a bill changes the next occurrences only; past payments are expenses and never change.
  Stopping a bill (`status='ended'`) keeps every past payment. Bills are never deleted.
- Money in integer centavos; dates are Manila business dates `YYYY-MM-DD` (`manila-date.ts`).
- Access = the `expenses` key (opt-in, ticked per person) + branch reach, exactly like expenses.
  Cashiers never see bills.
- v1 bills are paid from cash / gcash / maya / bank / card / owner — never `drawer`.
- No bill on an Ingredients-group category (the UI does not offer it; stock receiving already
  counts that cost). The database allows it so a category regrouped later never breaks a row.

## 2. Data (migration `supabase/migrations/20261022140000_expense_bills.sql`)

```
expense_bills
  id uuid pk default gen_random_uuid()
  tenant_id uuid not null → tenants on delete cascade
  outlet_id uuid null → outlets           -- NULL = whole store
  name text not null                      -- trimmed, 1..60
  category_id uuid not null → expense_categories (same store, trigger)
  supplier_id uuid null → suppliers (same store, trigger)
  paid_to_name text null                  -- trimmed, ≤80
  paid_from text not null default 'cash' check in ('cash','gcash','maya','bank','card','owner')
  amount_cents bigint null check (amount_cents between 1 and 1000000000)   -- NULL = changes every time
  repeat_kind text not null check in ('monthly','twice_monthly','weekly','months','after_days')
  repeat_every smallint not null default 1
  repeat_days smallint[] null             -- 1..31 or 0 = last day of the month
  repeat_weekday smallint null            -- 0 Sunday .. 6 Saturday
  starts_on date not null                 -- first due date on or after this day
  ends_on date null check (ends_on >= starts_on)
  remind_days_before smallint not null default 1 check (0..14)
  status text not null default 'active' check in ('active','paused','ended')
  paused_until date null                  -- only with status 'paused'; NULL = until resumed
  created_by uuid, created_by_name text, created_at timestamptz default now(), updated_at timestamptz
```

Shape CHECK per kind (the engine's `BillRule`):
- monthly: repeat_every = 1, repeat_days = 1 element, weekday NULL
- twice_monthly: repeat_every = 1, repeat_days = 2 distinct elements, weekday NULL
- weekly: repeat_every in (1,2), weekday not NULL, repeat_days NULL
- months: repeat_every in (2,3,4,6,12), repeat_days = 1 element, weekday NULL (counted from starts_on's month)
- after_days: repeat_every between 1 and 90, repeat_days NULL, weekday NULL

```
expense_bill_marks          -- "Nothing to pay this time" and "Remind me tomorrow"
  id uuid pk, tenant_id uuid not null, bill_id uuid not null → expense_bills
  due_on date not null, kind text not null check in ('skipped','snoozed')
  snoozed_until date null     -- required iff kind = 'snoozed'
  created_by uuid, created_at timestamptz default now()
  unique (bill_id, due_on)
```
Undo = DELETE the mark (the only DELETE anywhere in this feature). Re-snooze = delete + insert.

`expenses` gains `bill_id uuid null → expense_bills`, `bill_due_on date null`,
CHECK both NULL or both set, partial UNIQUE `(bill_id, bill_due_on) where status = 'recorded' and bill_id is not null`,
index `(tenant_id, bill_id)`.
- `expenses_guard`: `bill_id`, `bill_due_on` join the editable list (link / unlink "I already
  recorded it" on a recorded row; money stays immutable).
- `expenses_integrity`: a set `bill_id` must be a bill of the same store (any status).
- `replace_expense` carries `bill_id` + `bill_due_on` to the corrected copy (the voided row keeps
  them too; the partial unique index only covers recorded rows). Copy the body from
  `20261022130000_expenses_security_folds.sql`, keep its `app.expense_replace` mark.
- `record_drawer_expense` is unchanged (no drawer bills in v1).

RLS (authenticated only, anon nothing, no DELETE on bills):
- bills SELECT / INSERT / UPDATE: `app_user_has_permission(tenant_id,'expenses') and app_user_may_reach_branch(tenant_id, outlet_id)`.
- marks SELECT / INSERT / DELETE: same rule on the mark's tenant AND the bill must be visible
  (`exists (select 1 from expense_bills b where b.id = bill_id and b.tenant_id = tenant_id)`).
- Guard trigger on bills: tenant and created_by never change; created_by / created_by_name /
  created_at stamped for client roles; updated_at set; status 'ended' is final (no resume).
- Activity log: none in v1 (a payment already logs `expense.recorded`).
- The migration is applied live AND role-probed by the lead; agents never touch the live DB.

## 3. Shared engine (three files, byte-identical in `src/lib/expenses/` and `webnegosyo-app/lib/expenses/`, all in `PORTED_MODULES` in `tests/unit/expenses/app-parity.test.ts`)

- `bill-schedule.ts` — types, rules, due dates, occurrences, estimates, `billsDue`, `stillToPay`,
  `ruleSentence`, `nextDueDates`, `validateBillDraft`, `BILL_PRESETS`. Imports only `./manila-date`
  and `./types`. Also exports `roundToPeso`, `paymentsOwed`, `monthKeyOf`, `OPEN_STATES` for the other two.
- `bill-suggestions.ts` — `suggestBills` (+ `BillSuggestion`, `SuggestExpense`, `SuggestCategory`).
- `bill-reminders.ts` — `reminderPlan` (+ `BillReminder`, `BillReminderKind`,
  `DEFAULT_REMINDER_HORIZON_DAYS`, `REMINDER_HOUR_MANILA`).
- The last two import `./bill-schedule`, `./manila-date`, `./types` only. No zod, React, Supabase.
  Tests: `tests/unit/expenses/bill-{schedule,suggestions,reminders}.test.ts`,
  `bill-schedule.property.test.ts`, builders in `bill-fixtures.ts`.

Exports:

```ts
type DayOfMonth = number /* 1..31 */ | 'last'
type BillRule =
  | { kind: 'monthly'; day: DayOfMonth }
  | { kind: 'twice_monthly'; days: [DayOfMonth, DayOfMonth] }
  | { kind: 'weekly'; every: 1 | 2; weekday: number }
  | { kind: 'months'; every: 2 | 3 | 4 | 6 | 12; day: DayOfMonth }
  | { kind: 'after_days'; every: number }

interface Bill { id, tenantId, outletId, name, categoryId, supplierId, paidToName, paidFrom,
  amountCents: number | null, rule: BillRule, startsOn, endsOn: string | null,
  remindDaysBefore: number, status: 'active'|'paused'|'ended', pausedUntil: string | null,
  createdAt: string }
interface BillPayment { billId, dueOn, expenseId, amountCents, spentOn }   // recorded expenses with bill_id
interface BillMark { billId, dueOn, kind: 'skipped'|'snoozed', snoozedUntil: string | null }

type OccurrenceState = 'paid'|'skipped'|'snoozed'|'late'|'due_today'|'due_soon'|'upcoming'
interface Occurrence { billId, dueOn, state, amountCents: number | null /* bill amount or estimate */,
  isEstimate: boolean, payment: BillPayment | null, daysLate: number, lateCount: number }
```

- `ruleFromColumns(row)` / `ruleToColumns(rule)` — DB ⇄ rule (0 = 'last'); throws on an impossible row.
- `dueDatesBetween(bill, from, to, lastPaidDueOn?)` — every due date in [from, to], on/after
  `startsOn`, on/before `endsOn`. Day 29–31 (and 'last') fall on the month's last day. `months` counts
  from `startsOn`'s month. `weekly every 2` alternates from the first weekday on/after `startsOn`.
  `after_days`: ONE date = (lastPaidDueOn ?? startsOn) + every once paid, else startsOn.
- `occurrencesFor(bill, { today, payments, marks, horizonDays = 31 })` — the bill's open and recent
  occurrences, oldest first: every unpaid, unskipped due date from max(startsOn, today − 92 days) to
  today + horizonDays, plus this calendar month's paid/skipped ones. Several late ones COLLAPSE into the
  newest, with `lateCount` = how many. State: paid (a payment for that due date) → skipped → snoozed
  (snoozedUntil > today) → late (due < today) → due_today → due_soon (≤ 3 days) → upcoming. A paused
  bill yields nothing until `pausedUntil` (or at all while open-ended); an ended bill only its paid ones.
- `estimateCents(bill, payments)` — `amountCents`, else the rounded-to-peso average of the last 3
  payments, else null.
- `billsDue(bills, ctx)` — every bill's occurrences flattened, sorted late → due_today → due_soon →
  upcoming (then date, then name). `stillToPay(occurrences, monthKey)` → `{ cents, count, hasEstimate }`
  for late + this month's unpaid, unskipped ones (paused/ended excluded).
- `ruleSentence(rule, startsOn)` — "Every month on the 5th", "Every month on the last day",
  "Twice a month: 15th and last day", "Every week on Tuesday", "Every 2 weeks on Tuesday",
  "Every 3 months on the 10th", "Every year on 15 Mar", "About every 10 days after the last one".
- `nextDueDates(bill, today, n = 3, payments?)` — preview for the editor.
- `validateBillDraft(draft, today)` → `{ ok: true } | { ok: false, field, message }` (name, amount bounds, rule
  shape, startsOn not more than 400 days ago, endsOn ≥ startsOn, remind 0..14, paidFrom not drawer).
- `BILL_PRESETS` — Rent, Kuryente, Tubig, Internet, LPG, Sahod, SSS · PhilHealth · Pag-IBIG, Other:
  `{ key, name, systemKey (category to pick), rule, amountMode: 'fixed'|'varies', remindDaysBefore }`
  (rent / sahod / government: 3 days; others 1; LPG = after_days 10, varies; Kuryente/Tubig = monthly,
  varies; Sahod = twice_monthly [15,'last'], fixed).
- `suggestBills(expenses, categories, bills, today)` — a category (not ingredients / not_expense
  group) with a recorded expense in ≥2 of the last 3 full calendar months and no active/paused bill on
  it → `{ categoryId, typicalDay, typicalCents, monthsSeen }` (median day, median amount), newest first, max 3.
- `reminderPlan(bills, occurrences, today, horizonDays = 14)` — `{ id, fireOn, kind: 'before'|'due'|'late1'|'late3', billIds, title, body }`
  at 08:00 Manila: remind_days_before days ahead (or on the day when 0), the morning after the due
  date (late1) and 3 days after (late3); occurrences on the same fireOn bundle into one
  ("3 bills this week · ₱24,500"). Wording plain, never "You missed".

Property tests (`*.property.test.ts`, `propertyParameters()`): due dates always inside the bill window
and sorted; 'last' and 29–31 always land on a real date; twice_monthly yields exactly 2 per month;
months every N yields one per N months; occurrences never list a paid date as open; stillToPay ≥ 0 and
equals the sum of its rows.

## 4. Types and services

- `types.ts` (shared, byte-identical): `ExpenseDraft` gains optional `billId?: string | null` and
  `billDueOn?: string | null`; `Expense` gains `billId: string | null`, `billDueOn: string | null`.
  Web zod (`validation.ts` `expenseDraftSchema`, `.strict()`) accepts both (both or neither, uuid +
  date). Row mappers (`rows.ts`, app `expense-service.ts` `EXPENSE_COLUMNS`) read/write them. The app's
  offline queue carries them inside the draft.
- Web: `src/lib/expenses/bills/` — `bills-read.ts` (session client: bills, marks, this window's bill
  payments), `bills-service.ts` (create / update / pause / resume / end, mark / unmark, link / unlink
  expense; zero-row checks), zod `billDraftSchema`; actions `src/app/actions/expense-bills.ts`
  (`verifyTenantPermission(...,'expenses')`).
- App: `webnegosyo-app/lib/expenses/bills-service.ts` (direct RLS reads/writes as the signed-in user,
  zero-row checks, plain-word errors) + `use-bills.ts` (useResource keys include tenant; invalidated by
  `invalidateExpenses`).

## 5. UI (after the foundation lands)

App and web follow `recurring-bills.md` and the mockups. App route for the list: `expense-bills`
(NOT `bill`, which is the table check). Words: "Bills to pay", "Mark paid", "I already recorded it",
"Remind me tomorrow", "Nothing to pay this time", "Edit, pause or stop", "₱X still to pay · N bills",
"about ₱6,200" for estimates, "2 days late", "Due today", "Due Thu".
