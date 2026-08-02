# TDD Evidence — Superadmin tenant allowances

**Date**: 2026-08-02
**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: none on disk — journeys derived during this run from the request
"manage how many staff and branches a tenant could have", after grounding in the
existing subscription/allowance code.

## What was actually missing

Nearly all of this feature already shipped in migration
`20260808130000_subscriptions_and_limits.sql` (verified **applied** to the live
database by SQL probe). `tenants.max_outlets` and `tenants.max_staff_per_branch`
exist, `assertBranchHasRoom` and `assertOutletCapacity` enforce them, and the
merchant's own staff screens report seats back.

The gap was the control surface:

1. `updateTenantLimitsAction` (`src/app/actions/subscriptions.ts`) was complete,
   superadmin-guarded and clamped — with **zero callers**.
2. The only UI carrying the two inputs was `tenant-form.tsx`, which its own
   comment marks as the unused legacy form. The live form
   (`tenant-form-wrapper.tsx`) had no allowance fields.
3. The tenant zod schema in `tenants-service.ts` does not include either column,
   so even the legacy form's values would have been stripped before insert.

Net effect: allowances were **enforceable but unsettable**. Every tenant sat on
whatever the migration's backfill gave them (1 branch / 3 seats for all but
Gungjeon Unlimited, at 2 branches).

## User journeys

1. As the platform owner, I want to see how many branches and seats each tenant
   is using against their plan, so I know who to upsell and who is at a limit.
2. As the platform owner, I want to raise a client's branch or seat allowance
   after they pay for more, so they can grow without a deploy or a SQL console.
3. As the platform owner, I want to move a downgrading client onto a smaller
   plan without stripping anything they already built.
4. As the platform owner, I want a mistyped allowance to be rejected rather than
   silently bricking a merchant's ability to create branches.

## Task report

### Task 1 — Allowance usage reporting (`src/lib/billing/tenant-allowances.ts`)

Pure module deriving usage against allowance. Seats are counted **per branch
pool** (fullest pool wins, owner excluded, orphaned assignments skipped) to
mirror `countStaffInBranch` in `staff-service.ts`.

- **RED**: `npx jest --testPathPatterns=tenant-allowances` →
  `Cannot find module '@/lib/billing/tenant-allowances'` — compile-time RED, the
  module did not exist. Commit `395aea4`.
- **GREEN**: same command → `Tests: 11 passed, 11 total`. Commit `4f69efb`.

### Task 2 — Branch allowance floor (`sanitizeOutletAllowance`)

`resolveLimit` accepts `0` and the column carries no CHECK, so a mistyped `0`
stored cleanly and then refused every branch creation while telling the merchant
their plan included none.

- **RED**: `Tests: 8 failed, 11 passed` — sanitizers undefined.
- **GREEN**: `Tests: 19 passed, 19 total`. Wired into
  `updateTenantLimitsAction`, replacing the raw `resolveOutletLimit`/
  `resolveStaffLimit` calls. Commit `92080f8`.
- Seats deliberately keep a floor of `0`: an owner-only store buys no seats.

### Task 3 — The wire (`allowance-dialog.tsx`, `subscription-manager.tsx`, page)

- **RED**: `npx jest --testPathPatterns=allowance-editor-wiring` →
  `Tests: 7 failed, 7 total`. Commit `dc75e20`.
- **GREEN**: `Tests: 21 passed` for the wiring suite plus the pre-existing
  collections-screen suite, confirming no regression to the table it shares.
  Commit `bccecfc`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Branch usage is counted against the tenant's allowance | `tenant-allowances.test.ts:counts the branches a tenant holds` | unit | PASS |
| 2 | An unset allowance reads as the platform default, never unlimited | `tenant-allowances.test.ts:falls back to the platform defaults` | unit | PASS |
| 3 | The owner never consumes a seat | `tenant-allowances.test.ts:excludes the owner from the seat count` | unit | PASS |
| 4 | Seats report the fullest branch, not the store-wide total | `tenant-allowances.test.ts:reports the fullest single branch` | unit | PASS |
| 5 | Store-wide accounts form their own seat pool | `tenant-allowances.test.ts:counts store-wide accounts as their own pool` | unit | PASS |
| 6 | A tenant above a lowered allowance is flagged, not blocked | `tenant-allowances.test.ts:flags a branch allowance that has been lowered` | unit | PASS |
| 7 | A tenant exactly at its limit is not painted as over | `tenant-allowances.test.ts:does not treat a full branch as over` | unit | PASS |
| 8 | Staff on a deleted branch do not inflate any pool | `tenant-allowances.test.ts:ignores staff attached to a branch the tenant no longer has` | unit | PASS |
| 9 | A branch allowance of 0 or less is refused | `tenant-allowances.test.ts:refuses to store a branch allowance of zero` | unit | PASS |
| 10 | A seat allowance of 0 is honoured | `tenant-allowances.test.ts:allows zero seats` | unit | PASS |
| 11 | Usage renders as `used / limit` per tenant | `allowance-editor-wiring.test.tsx:shows branches used against the branch allowance` | unit | PASS |
| 12 | **Saving reaches `updateTenantLimitsAction` with what was typed** | `allowance-editor-wiring.test.tsx:sends what the owner typed to the server action` | unit | PASS |
| 13 | The dialog opens prefilled with current allowances | `allowance-editor-wiring.test.tsx:opens prefilled` | unit | PASS |
| 14 | A downgrade warns but stays saveable | `allowance-editor-wiring.test.tsx:warns before lowering an allowance` | unit | PASS |
| 15 | A failed save surfaces the error instead of closing | `allowance-editor-wiring.test.tsx:surfaces a failed save` | unit | PASS |

Row 12 is the one that matters most: it is the exact failure mode that let a
complete, correct server action ship with nothing calling it.

## Coverage and validation

```
npx jest --testPathPatterns="tenant-allowances|allowance-editor" --coverage
  tenant-allowances.ts   100% stmts / 100% branch / 100% funcs / 100% lines
  allowance-dialog.tsx   100% stmts / 100% branch / 100% funcs / 100% lines

npx jest --testPathPatterns="allowance|subscription|staff|outlets|tenant-limits"
  Test Suites: 38 passed    Tests: 675 passed

npx eslint <the 5 changed files>   → clean
npx tsc --noEmit | grep '^src/'    → clean (pre-existing errors in tests/ only)
npm run build                      → success
```

## Known gaps

- **No test covers `subscriptions/page.tsx` itself.** It is a server component
  doing IO; its grouping logic is thin and the pure half it feeds is fully
  covered. A regression there would show as blank `—` cells, not wrong numbers.
- **Not manually exercised against the live database.** The obvious smoke test
  is raising Gungjeon Unlimited (currently 2/2 branches) to 3 and confirming the
  Branches page lets them add a third.
- **Two settings that can still drift**: `multi_branch_enabled` lives on the
  tenant form while `max_outlets` lives on the subscriptions screen, so a tenant
  can have multi-branch switched on and an allowance of 1. Deliberately left
  alone; worth a warning on the tenant form later.
- The unused allowance inputs on the legacy `tenant-form.tsx` were left in
  place — removing dead form fields is a separate cleanup.
