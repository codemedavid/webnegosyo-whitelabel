# Bills to pay (recurring expenses) — plan, awaiting the owner's OK

Visual plan with phone mockups: https://claude.ai/artifact/8dPWahKqrrtyiHi1RkS5JS
Builds the master plan's Phase 4 (`docs/plans/2026-10-21-expense-tracker.md` §5.5, §6.1 `expense_bills`).

## Rules

- A bill is a reminder, not spending. Spent and Profit count only paid occurrences.
- Paying = one real expense through the existing add sheet, pre-filled and editable; linked by
  `expenses.bill_id` + `expenses.bill_due_on` (partial unique per bill + date on recorded rows).
- "I already recorded it" links an existing expense (no new row). "Nothing to pay this month" is undoable.
  Editing a bill never rewrites past expenses; stopping a bill keeps them.
- Fixed amount or "changes every time" (amount NULL; estimate = recent paid average).
- Name: "Bills to pay" (the app's "Bill" already means the table check: `app/(main)/bill.tsx`).

## Repeat rules (pure, shared web/app, property-tested)

monthly (day 1–28 or last day) · twice a month (two days, default 15th + last) · weekly / every 2 weeks
(weekday) · every N months (3, 6, 12; day or last) · about every N days after the last payment (LPG).
Days 29–31 fall back to the month's last day. Due dates are computed, never stored.

## Data (one migration, then probe as each role)

- `expense_bills`: tenant, outlet (NULL = store), name ≤60, category, supplier / paid_to_name, usual
  paid_from (not `drawer` in v1), amount_cents NULL = varies, repeat_kind, repeat_every, repeat_days int[]
  (0 = last day), repeat_weekday, starts_on, ends_on, remind_days_before, status active|paused|ended,
  paused_until, created_by/at. RLS = the expenses rules (`expenses` + branch reach). No DELETE.
- `expense_bill_marks`: (bill_id, due_on) unique, kind skipped|snoozed, snoozed_until, actor, at.
- `expenses.bill_id`, `expenses.bill_due_on`; guard allows linking/unlinking on a recorded row (the only
  money-neutral change); `replace_expense` carries both; integrity checks same store + bill not ended.

## Where it shows

Expenses hero "₱X still to pay · N bills" · "Bills to pay" card on Expenses home (≤3, late first) ·
sub-screen `expense-bills` (Late / This week / Later / Paid, folded) · bill sheet (Mark paid, already
recorded, remind tomorrow, nothing this month, edit/pause/stop) · add-bill sheet (preset chips, same /
changes, how-often sentences, next three dates, remind lead, usual source) · Undo bar "Repeat" for rent,
utilities and staff categories · "Make it a bill?" in Needs you (same category ≥2 of last 3 months) ·
detail "Repeat this" / "Paid for: Rent, October" · Home row only when due ≤3 days or late · Profit uses
bills for the missing-rent hint and adds "If you pay the N bills left: about ₱X kept" · web Bills tab.
Cashiers never see bills. Ingredient bills are not offered (stock receiving already counts them).

## Reminders

v1: local notifications on the owner's phone (expo-notifications, OTA) at 8 AM: lead days before
(default 1; 3 for rent, sahod, government), the morning after the due date, and 3 days later; bundled
when ≥2 fall together. Later: server push via `merchant_notifications` (`bill_due`/`bill_overdue`, gate
moved off `menu`, daily cron, parity test) and opt-in auto-log after 3 steady payments.

## Steps

1. Migration + engine + SQL role runner. 2. App screens. 3. Ways in + phone reminders. 4. Web tab.
Later: server push, auto-log, drawer payments.
