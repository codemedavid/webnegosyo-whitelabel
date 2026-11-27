# Manage expense categories in the merchant app

Status: APPROVED + BUILT 2026-11-27 on feat/app-expense-categories (uncommitted). DB probed as owner; simulator walked on sample-demo (add, rename, regroup, move, archive, restore; rows checked in the DB).

## Why
Owners can add, rename, reorder and archive expense categories on the web
(Expenses → gear → `CategoriesDialog`), but the merchant app only reads them.
An owner who runs the store from the phone has to open the web to add "Ice"
or rename "Other".

## What already exists (no database change needed)
- `expense_categories` RLS already lets a **store-wide** account with the
  `expenses` key insert and update (`20261022120000_expenses.sql` §6). A
  branch-locked account is refused with **zero rows**, not an error.
- `expense_categories_guard` already enforces the rules: starter (seeded)
  categories keep their group and "needs a note"; a category's group is locked
  once any expense uses it; names are unique among live categories; nothing is
  ever deleted, only archived (`archived_at`).
- Web writers to mirror: `src/lib/expenses/expense-service.ts`
  `saveCategory` / `archiveCategory` (assert the row came back; unique
  violation → "name taken").

So this is app-only JavaScript → ships by OTA, no migration, no web change.

## What changes

1. **Writers** — `webnegosyo-app/lib/expenses/expense-service.ts`:
   `saveCategory(db, tenantId, draft)` and `archiveCategory(db, tenantId, id, archived)`,
   same columns and messages as the web, each checking that a row was written
   (zero rows = "no access / category gone").
2. **Pure model** — `webnegosyo-app/lib/expenses/category-manage.ts`:
   draft checks (name 1–60, trimmed), what is locked and why (starter → group +
   note locked; used → group locked), next sort order for a new category in a
   group, the swap for Move up / Move down. Unit tested.
3. **Screen** — `app/(main)/expense-categories.tsx` (beside `expense-bills.tsx`):
   - Categories listed by group with the owner-words hint ("Rent", "Running the
     store", "Not an expense · moves cash only"), using the existing
     `CategoryTile` look.
   - "+ Add" per group → bottom sheet: Name, Counts as (group), Needs a note.
   - Tap a category → same sheet to rename / change group (when allowed, with
     the lock reason shown when not) / Move up / Move down / Archive.
   - "Show archived (n)" → Restore.
   - Saving refreshes the category list everywhere (Add expense picker,
     filters, bills) via the existing categories resource.
   - Needs a connection; offline shows a plain "Connect to change categories".
4. **Ways in**
   - Expenses header: a "Categories" icon button, shown only to store-wide
     accounts with `expenses` (branch-locked accounts never see it, since the
     database would refuse them anyway).
   - The Add expense "All categories" list gets a "Manage categories" row at
     the bottom (same visibility).
5. **Not in this change**: editing the web "Badge" letters (the app draws
   icons/initials from `category-look.ts`, so the badge isn't shown there; the
   web keeps owning it — an app save leaves it untouched); delete (never
   exists); bulk re-categorise (web only).

## Tests
- Service tests: insert/update/archive send the right columns; zero rows →
  refusal message; unique violation → "name taken".
- Model tests: lock rules, sort order for new rows, move swaps incl. equal
  sort orders.
- Screen test: groups render, add/edit/archive/restore call the writers, the
  entry button is hidden for branch-locked and no-`expenses` accounts.
- `npm test` in `webnegosyo-app`, root `npm run verify`.

## Proof before "done"
- Simulator walk on `sample-demo` (test store): add a category, rename it,
  move it, archive and restore it, then see it in the Add expense picker.
- `execute_sql` on platform: the row exists with the right `grp` /
  `sort_order` / `archived_at`. The test category is left archived on
  `sample-demo` (categories are never deleted).
- As a branch-locked account: entry is hidden (and a direct write returns 0 rows).
- Ship: OTA to 1.0.22 / 1.0.23 after the PR merges.
