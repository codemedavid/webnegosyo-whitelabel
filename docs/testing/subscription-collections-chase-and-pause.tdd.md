# Subscriptions — the chase list and the pause lever

TDD evidence for the superadmin subscriptions work: seeing who must pay within
seven days, and being able to cut a tenant off or let them back in.

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from the request:
"know whose the tenants that needs payments within 7 days and be able to confirm
the payment and or pause the tenant."

**Interpretation recorded:** "needs payment within 7 days" was read as *renewals
falling due inside the next seven days*, kept SEPARATE from tenants already
overdue. Both belong on a chase list, but they are different conversations — one
is a reminder, the other a collection — and blending their money into a single
figure would let a debt read as a forecast. The screen's "Needs payment" filter
shows both; the two totals stay apart.

**Already existed, not rebuilt:** recording a payment (`markPaid`, the ledger,
`MarkPaidDialog`, `markTenantPaidAction`) and the access gate. The gaps were the
seven-day horizon and the pause lever.

## User journeys

1. As the platform owner, I want to see which tenants come due within a week, so
   I can chase them before their admin goes dark rather than after.
2. As the platform owner, I want the chase list on its own, so a screen of 172
   tenants does not bury the handful who need me today.
3. As the platform owner, I want to know how much is owed and how much is merely
   expected, separately, so I do not read a debt as revenue on schedule.
4. As the platform owner, I want to cut a non-paying client off today, without
   waiting for their grace to run out or opening the SQL console.
5. As the platform owner, I want to let a client back in without accidentally
   handing them a free month.
6. As a merchant, I want the days I already paid for to survive being paused, so
   a pause-and-resume does not cost me service I bought.

## Task report

### 1. `daysUntilDue` on the shared access verdict

Added to `resolveSubscriptionAccess` rather than computed on the screen, for the
same reason `daysOverdue` lives there: three surfaces read this subscription and
must not each hold their own opinion about what day it is.

- RED: `npx jest --testPathPatterns="subscription-(due-soon|lifecycle)"` →
  `Tests: 18 failed, 2 passed, 20 total`
- GREEN: `npx jest --testPathPatterns="subscription"` →
  `Tests: 101 passed, 101 total`

Guaranteed: 0 on the last paid day (not 1); null once overdue, when manually
paused, when there is no due date, and when there is no subscription row.

### 2. The seven-day window on the roster

`DUE_SOON_WINDOW_DAYS = 7`, `isDueSoon`, and a fourth sort tier between "in
grace" and "comfortably paid".

- RED / GREEN: as above.

Guaranteed: money owed still outranks money expected; the seventh day is
included; an unbilled tenant is never mistaken for one due today.

### 3. Pause and resume (`subscription-lifecycle.ts`)

Kept apart from `subscription-service.ts` because the invariant is the opposite
one: `markPaid` exists to move `paid_through`; these two must never touch it.

- RED: module did not exist — compile failure was the signal.
- GREEN: `Tests: 101 passed, 101 total`.

Guaranteed: a manual pause beats a live paid-through date; the date survives
both operations; resuming a tenant who lapsed in May leaves them overdue rather
than granting a free month; a tenant with no subscription row can still be
paused.

### 4. `isManuallyPaused` on the roster

A tenant the owner cut off and a tenant the calendar closed both read as
`paused`. Only the first can be undone without being paid.

- RED: `npx jest --testPathPatterns="subscription-roster"` →
  `Tests: 4 failed, 12 passed, 16 total`
- GREEN: `Tests: 116 passed, 116 total`

### 5. The screen: filter, due-in column, pause lever

- RED: `npx jest --testPathPatterns="subscription-collections-screen"` →
  `Tests: 10 failed, 1 passed, 11 total`
- GREEN: `Tests: 116 passed, 116 total`

### 6. `setTenantPausedAction`

Superadmin-checked from the caller's own session, never from an argument, in
line with the other actions in that file. Takes a boolean rather than a status
string so the client can never name a status of its own — `cancelled`, or a typo
the CHECK constraint rejects at the moment the owner is trying to stop a store
trading. Revalidates the tenant's admin layout as well as this screen, since the
gate is read there.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | The last paid day reads as 0 days left, not 1 | `subscription-due-soon.test.ts:reports zero on the last paid day` | unit | PASS |
| 2 | Days-until-due is null once overdue, so it cannot read as a future renewal | `subscription-due-soon.test.ts:is null once the date has passed` | unit | PASS |
| 3 | A manually paused tenant is never described as renewing | `subscription-due-soon.test.ts:is null for a manually paused tenant` | unit | PASS |
| 4 | The window is seven days and includes the seventh | `subscription-due-soon.test.ts:includes the seventh day itself` | unit | PASS |
| 5 | An overdue tenant is not also flagged "due soon" | `subscription-due-soon.test.ts:does not flag an overdue tenant` | unit | PASS |
| 6 | About-to-lapse ranks above comfortably paid, soonest first | `subscription-due-soon.test.ts:ranks the about-to-lapse above the comfortably paid` | unit | PASS |
| 7 | Everyone overdue still ranks above everyone merely due soon | `subscription-due-soon.test.ts:still ranks everyone already overdue above` | unit | PASS |
| 8 | A tenant with no due date is never put on the chase list | `subscription-due-soon.test.ts:never flags a tenant with no due date` | unit | PASS |
| 9 | Expected-this-week money is totalled apart from money owed | `subscription-due-soon.test.ts:keeps the due-soon total apart` | unit | PASS |
| 10 | A due-soon tenant still counts in MRR — they are current | `subscription-due-soon.test.ts:still counts a due-soon tenant in MRR` | unit | PASS |
| 11 | A manual pause blocks a tenant with days still left on their period | `subscription-lifecycle.test.ts:blocks the tenant immediately` | unit | PASS |
| 12 | Pausing keeps the paid-through date | `subscription-lifecycle.test.ts:keeps the paid-through date` | unit | PASS |
| 13 | A tenant with no subscription row can still be paused | `subscription-lifecycle.test.ts:pauses a tenant who has no subscription row yet` | unit | PASS |
| 14 | Pausing twice is not an error | `subscription-lifecycle.test.ts:is idempotent` | unit | PASS |
| 15 | Resuming returns unused paid days | `subscription-lifecycle.test.ts:gives back the unused days` | unit | PASS |
| 16 | Resuming a long-lapsed tenant grants no free month | `subscription-lifecycle.test.ts:does NOT hand a free month` | unit | PASS |
| 17 | A blank tenant id is refused rather than writing an orphan row | `subscription-lifecycle.test.ts:refuses a blank tenant id` | unit | PASS |
| 18 | A hand-paused tenant is distinguishable from a date-closed one | `subscription-roster.test.ts:telling a manual pause apart` | unit | PASS |
| 19 | The screen headlines how many tenants come due this week | `subscription-collections-screen.test.tsx:headlines how many tenants` | component | PASS |
| 20 | Each about-to-lapse row shows its days remaining | `subscription-collections-screen.test.tsx:shows how many days each` | component | PASS |
| 21 | The filter narrows to only those who owe or are about to | `subscription-collections-screen.test.tsx:narrows the table` | component | PASS |
| 22 | An empty chase list says so rather than showing a blank table | `subscription-collections-screen.test.tsx:says so plainly when nobody is due` | component | PASS |
| 23 | Pause and Resume go through the action, with the row's own tenant id | `subscription-collections-screen.test.tsx:cuts the tenant off through the action` | component | PASS |
| 24 | Resume is not offered on a merely-overdue tenant | `subscription-collections-screen.test.tsx:does not offer to resume a tenant who is merely overdue` | component | PASS |
| 25 | A refused pause is surfaced, never silent | `subscription-collections-screen.test.tsx:surfaces a refused pause` | component | PASS |

## Coverage

`npx jest --testPathPatterns="subscription" --coverage --collectCoverageFrom="src/lib/billing/**/*.ts"`

```
All files                    |   96.49 |    98.05 |   82.92 |   96.49
  subscription-lifecycle.ts  |     100 |      100 |     100 |     100
  subscription-roster.ts     |     100 |      100 |     100 |     100
  subscription-service.ts    |     100 |      100 |     100 |     100
  subscription-status.ts     |   95.43 |    97.05 |   66.66 |   95.43
  subscription-repository.ts |   67.39 |      100 |      50 |   67.39
  subscription-manager.tsx   |     100 |    93.93 |      75 |     100
```

Full suite: `npx jest` → `358 passed, 1 skipped; 4425 tests passed`.
Lint: `npx eslint` on the changed source files → clean.

## Known gaps

- **`setTenantPausedAction` has no test of its own.** Its authorization is the
  same `requireSuperadmin` the two existing actions in that file use, and no
  action in this codebase is unit-tested. The component test proves the screen
  calls it correctly and surfaces its refusal; it does not prove the superadmin
  check. That check is belt-and-braces over a superadmin-only RLS policy.
- **`subscription-repository.ts` at 67%** — the uncovered half is the Supabase
  write store, exercised only against a live database.
- **Not verified against a live tenant.** No probe was run; the pause path has
  not been observed closing a real merchant's admin.
- **A pause writes no audit trail.** Payments record who wrote them
  (`recorded_by`); a pause records only the status. The `notes` column exists if
  that is wanted later.
- **Pre-existing `tsc` errors** in unrelated test files (inventory, product
  detail) remain; 50 total, none in these modules. One in
  `subscription-overdue-total.test.ts` (a `status` key that was never on
  `RosterRow`) was fixed in passing, and its fixture cast removed so it cannot
  hide a missing field again.

## Merge evidence

RED → GREEN → refactor checkpoints on `feat/platform-supabase-order-parity`:

- `9e008d7` test: add reproducers for due-soon renewals and pause/resume (RED, 18 failed)
- `5c1ce55` feat: surface renewals due within seven days, and pause or resume a tenant (GREEN, 101 passed)
- `7f4f8cf` refactor: drop the unused clock from the pause and resume levers (still 101 passed)
- `b69f496` test: add reproducer for the due-soon filter and the pause lever (RED, 10 failed)
- `3588a24` feat: chase list and pause lever on the superadmin subscriptions screen (GREEN, 116 passed)
