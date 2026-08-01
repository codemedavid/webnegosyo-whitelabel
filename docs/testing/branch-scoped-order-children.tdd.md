# Branch-scoped order children — TDD evidence

## Source plan

No `*.plan.md`. This came out of an audit of the branch-scoped staff/branch
feature (`docs/testing/branch-scoped-staff.tdd.md`,
`docs/testing/branch-scoped-order-reads.tdd.md`). The journey below was written
during this run.

## User journey

> As a merchant who has locked an account to one branch, I want that account to
> see only its own branch's money, so that a branch manager cannot read what the
> other branches took.

## What the audit found

The application layer and most of the database already honour the lock. Probing
the live database for tables that carry an `outlet_id` but whose RLS ignores it
surfaced two:

| Table | Policies | Predicate |
|---|---|---|
| `order_payments` | `order_payments_select`, `order_payments_write_admin` | tenant-only |
| `order_revisions` | `order_revisions_select`, `order_revisions_write_admin` | tenant-only |

Both were created in `20260803120000_order_edit_and_payments.sql`, whose header
records that the policies were made "deliberately identical in shape to
`orders_select_by_tenant` / `orders_write_admin`". `20260804120000` replaced that
shape on `orders` and `order_items` the next day and did not reach these two.

Live confirmation (Supabase MCP, `pg_policies`): the four policies above test
`au.tenant_id` only, while `orders` tests
`app_user_may_see_order(tenant_id, outlet_id)`. At audit time the store had 4
outlets and 1 branch-scoped account, so the leak was reachable, not theoretical.

## Task report

### 1. Reproduce

`tests/unit/branch-scoped-order-children.test.ts` replays the whole migration
corpus in filename order and asserts every surviving policy on the two tables
references `app_user_may_see_order`. Replay rather than newest-file, for the
reason given in `inventory-ledger-append-only.test.ts`: a later migration that
re-widened an earlier narrowing must not pass.

```
$ npx jest --testPathPatterns="branch-scoped-order-children"
● every surviving policy on order_payments honours the account branch
    - Array []
    + Array [ "order_payments_select", "order_payments_write_admin" ]
● every surviving policy on order_revisions honours the account branch
    - Array []
    + Array [ "order_revisions_select", "order_revisions_write_admin" ]
Tests: 2 failed, 2 passed, 4 total
```

RED for the intended reason: the two guard tests ("still governed by policies at
all") passed, so the failure is the missing branch predicate and not a parsing
or setup error.

### 2. Fix

`supabase/migrations/20260814120000_branch_scoped_order_children.sql` rewrites
all four policies onto the existing `app_user_may_see_order` predicate — the
same function `orders` uses, called with each table's own `tenant_id`/`outlet_id`
rather than a fifth inlined copy of the rule. It also backfills each child's
`outlet_id` from its parent order (a NULL child would otherwise become
owner-only under the new predicate and hide a branch's own takings from it), and
adds the two supporting indexes.

Both `_select` and `_write_admin` are rewritten per table: `_write_admin` is
`FOR ALL`, so it grants SELECT too, and permissive policies are OR-ed — narrowing
only the select policy would have changed nothing.

```
$ npx jest --silent --testPathPatterns="branch-scoped-order-children"
PASS tests/unit/branch-scoped-order-children.test.ts
Tests: 4 passed, 4 total
```

### 3. Regression

```
$ npx jest --silent --testPathPatterns="(branch|staff|outlet|order)"
Test Suites: 97 passed, 97 total
Tests:       1328 passed, 1328 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every surviving RLS policy on `order_payments` honours the account's branch | `branch-scoped-order-children.test.ts:every surviving policy on order_payments honours the account branch` | unit | PASS |
| 2 | Every surviving RLS policy on `order_revisions` honours the account's branch | `branch-scoped-order-children.test.ts:every surviving policy on order_revisions honours the account branch` | unit | PASS |
| 3 | Neither table is left with zero policies (RLS denies by default, so a narrowing that dropped them all would look like a pass) | `branch-scoped-order-children.test.ts:%s is still governed by policies at all` | unit | PASS |

### 4. Apply

**APPLIED 2026-08-01** via Supabase MCP (`apply_migration`,
`name=branch_scoped_order_children`, one ledger row recorded).

Verified after apply, against the live database rather than the success flag:

- All four policies on the two tables now test `app_user_may_see_order`
  (`pg_policies`, 4/4).
- Sweeping every table carrying an `outlet_id` for a SELECT/ALL policy that
  ignores it now returns only legitimate cases: five superadmin-only policies
  (`au.role = 'superadmin'`, no branch to honour) and
  `outlet_menu_items_select_public` (`qual = true`, the storefront menu read,
  public by design). No branch-blind admin policy remains.
- Data intact: 38 payment rows before and after, 0 revisions, 2 new indexes.
- The backfill was a no-op, as predicted before applying: all 38 payments had a
  NULL `outlet_id` and so did all their parent orders, so there was nothing to
  inherit.

Behaviour change measured on the one live branch-scoped account: it could see 0
of these payment rows before the fix and 0 after (its tenant has none yet), while
a store-wide account still sees all 38. So the fix is preventative — it closes
the hole before that tenant starts taking payments, and changes nothing for
anyone today.

## Coverage and known gaps
- The audit covered tables carrying an `outlet_id` column. Tables that reach a
  branch only through a join were not swept, and `order_items` is covered by
  `20260804120000` through its parent.
- Convex-backed tenants are unaffected here and remain UI-level only — its
  mutations authenticate nowhere by design.

## Merge evidence

RED: 4 policies missing the branch predicate (`ff46f25`).
GREEN: all four rewritten onto `app_user_may_see_order`, 4/4 tests, 1328
regression tests passing (`2631140`). No refactor stage was needed.
