# TDD evidence — branch-scoped order reads and write guards

**Branch**: `feat/platform-supabase-order-parity`
**Date**: 2026-07-30
**Source plan**: `.claude/plans/branch-first-owner-view.plan.md` (phases 3 and 4), scoped
down to A–D during the status review that opened this session. Phases 5 (in-app
team/branch management) and 6 (branch-targeted push) are deliberately untouched.

## What this closes

`20260802120000` gave an account a branch and the application layer began honouring it.
The claim in `branch-first-owner-view.plan.md` that "a manager's session cannot fetch,
mutate, or be notified about another branch's orders — verified server-side" was **not
true**: every order surface narrowed its own *render* through `useBranchScope`, so a
manager never saw another branch's orders, but the rows still arrived on their device
with customer names and phone numbers attached, and `orders_select_by_tenant` granted
them to anyone in the tenant.

Two further gaps surfaced while reading the code, neither in the original plan:

1. **`outlets_write_admin` was too permissive.** It is `FOR ALL` for any `role='admin'`
   in the tenant, and a branch manager *is* `role='admin'` — the deliberate choice in
   `20260802120000`, never followed up here. A manager of one branch could rename or
   deactivate every other branch.
2. **POS sales stamp the branch into `customerData` only, never the `outlet_id`
   column** (`pos-order-outlet.test.ts`). A naive server-side `.eq('outlet_id')` filter
   would have *hidden* every counter sale from the branch that rang it up. This is why
   A1 exists and why the migration carries a backfill.

## Deviation from the plan, and why

The plan said to thread **the effective scope** (account scope composed with the branch
an owner has drilled into) into every `orders:*` call. That is wrong, in a way worth
recording:

- Narrowing the *query* by the drill-down would leave `portfolio.tsx` and `branches.tsx`
  unable to fetch the branches they exist to compare — the exact collapse
  `business-screen-mount.test.ts` already pins on the screens, reappearing one layer
  down.
- It buys no safety. The effective scope is narrower than the account scope only when
  the account scope is `all`, i.e. an owner, who may see the whole store anyway.

So the server-side filter uses the **account** scope (the security boundary) and the
drill-down stays a client-side narrowing (a UX affordance). `lib/branch-read-scoping.test.ts`
pins that distinction in both directions.

## User journeys

1. As a branch manager, I want my device to receive only my branch's orders, so another
   branch's customers' names and phone numbers never reach it.
2. As a branch manager, I want my dashboard takings to be my branch's, not the whole
   company's.
3. As a branch manager, I do not want my device to refetch or chime for a sale at
   another branch — that alone tells me the sale happened.
4. As an owner, I want to drill into a branch and still be able to open the portfolio
   that compares all of them.
5. As an owner, I do not want a branch manager renaming or deactivating branches they do
   not run.
6. As a store, I want a counter sale to stay visible to the branch that rang it up.
7. As any of the 121 live platform tenants and 157 existing store-wide accounts, I want
   to read exactly what I read yesterday.

## Task report

### A1 — promote the branch from `customerData` into the `outlet_id` column

Summary: `buildCreateOrderRows` now fills `orders.outlet_id` from the branch the register
already wrote into `customerData`, so a counter sale survives a column-based read filter.

- RED: `npm test -- supabase-orders` →
  `error TS2339: Property 'outlet_id' does not exist on type 'OrderInsert'` ×4.
- GREEN: `npm test -- supabase-orders` → PASS.

Guarantees: the column is filled from the blob; the blob is kept for the other backends;
a single-location register writes `null`; a blank or non-string blob value yields `null`
rather than an empty string (which Postgres would reject as an invalid uuid, failing the
whole sale).

### A2 — narrow adapter reads by the account's branch

Summary: `runPlatformQuery` takes a `BranchScope` and applies `.eq('outlet_id', …)` to
`getOrders`, `getOrderById`, `getRealtimeQueue`, both stats reads, and `getAllOrderItems`
(through its parent-order join).

- RED: `error TS2554: Expected 4 arguments, but got 5` ×8.
- GREEN: PASS.

Guarantees: each of the six reads is narrowed; the tenant filter is *layered with* the
branch filter, never replaced by it; a store-wide account and an omitted scope both add
no clause at all.

### A3 — branch-check realtime payloads

Summary: `isOrderChangeInScope` replaces the tenant-only check at the subscription
callback. Supabase Realtime accepts one filter clause per binding and it is spent on
`tenant_id`, so the branch has nowhere else to be checked.

- RED: `isOrderChangeInScope` did not exist.
- GREEN: PASS.

Guarantees: own branch accepted, another branch rejected, unattributed rejected for a
branch account (matching `isOrderInScope`), `old` row read on delete, `customer_data`
fallback when the column is empty, every branch accepted for a store-wide account, and
another tenant still rejected whatever the branch says.

### A4 — thread the scope through `lib/hooks.ts`

Summary: `useSafeQuery` and `useSafeMutation` resolve `useAccountBranchScope()` and pass
it down. No screen changed.

- RED: 4 of 5 guardrail assertions failed.
- GREEN: PASS. One test needed correcting mid-run: `not.toMatch(/\buseBranchScope\b/)`
  was tripped by the prose comment explaining why the narrowed hook is *not* used, so it
  now asserts on the import specifically, matching `business-screen-mount`.

Guarantees: the account scope is resolved in the dispatch hook; `useBranchScope` is *not*
imported there; the scope reaches `runPlatformQuery`; the payload check is wired; and
`scopeKey` is in the effect's dependencies so a session that resolves its branch after
the first fetch re-reads instead of waiting for the next poll.

### A5 — `orders`/`order_items` RLS branch predicate + backfill

Summary: migration `20260804120000`. One `STABLE`, non-`SECURITY DEFINER` helper
(`app_user_may_see_order`) used by four policies, plus the blob→column backfill and a
`(tenant_id, outlet_id)` index.

The trap here is real and is called out in the migration header: `orders_write_admin` is
`FOR ALL`, so it **also grants SELECT**, and permissive policies are OR-ed together —
tightening only the select policy would have changed nothing. `20260726140000` left a
warning about exactly this. All four policies were rewritten.

### B — branch CRUD is store-wide only

Summary: `canManageOutlets` (pure), enforced in the outlets server actions from the
**caller's session** rather than from an argument, and `outlets_write_admin` tightened
with `au.outlet_id IS NULL` (migration `20260804130000`).

- RED: `npx jest tests/unit/outlets-manage-guard.test.ts` → 8 failed, 1 passed.
- GREEN: PASS.

All three layers, because the RLS policy is the thing that was too permissive here —
"the policy will catch it" was never true. Reads stay ungated: the branch picker and
every order screen list branches.

### C — write-side branch guards

Summary: `canEditOrder` takes a scope and refuses another branch's order; the adapter
puts the branch in the `WHERE` clause of the patch, the revise, and the read that
precedes the revise.

- RED: `error TS2353: 'scope' does not exist in type 'EditRequest'` ×6, `TS2554` ×3.
- GREEN: PASS.

The branch goes into the write's own `WHERE` rather than into a check performed first, so
an out-of-branch write matches no row instead of racing a read-then-write. `createOrder`
is deliberately unscoped: an insert has no existing row to guard, and its branch comes
from the register's own `customerData`. The refusal order puts the final-status reason
ahead of the branch one — a delivered order is not editable by anyone, so telling a
manager it belongs to another branch would send them to ask for access that would not
help.

### D — probes against live data

Both migrations applied via Supabase MCP, registered as `20260730024308` and
`20260730024316`.

Pre-state: 158 accounts, **0 branch-scoped**; 4 outlets; 1,709 orders, **0 with an
`outlet_id`**, **0 blob-only**. So both changes applied inert, and the backfill had
nothing to do — which is itself the finding that no live tenant has multi-branch in use.

| Probe | Result |
|---|---|
| All 4 order policies use the helper, none is an `au.tenant_id = au.tenant_id` tautology | pass |
| Predicate truth table, evaluated inside `EXISTS(… WHERE …)` — 8 cases | 8/8 correct |
| `outlets_write_admin` carries `outlet_id IS NULL` | pass |
| Helper is `STABLE` and **not** `SECURITY DEFINER` | pass |
| `idx_orders_tenant_outlet` present | pass |
| `orders` count unchanged (1,709); branch-scoped accounts still 0 | pass |
| `orders_insert` / `order_items_insert` intact (anonymous storefront checkout) | pass |

**A first probe reported a failure and was itself wrong.** Evaluating
`(account_outlet IS NULL OR account_outlet = order_outlet)` as a *column* returns NULL
for a branch account against a no-branch order, not false. Re-running it in the shape the
policy actually uses — inside `EXISTS(… WHERE …)`, where NULL filters the row out — gave
false, the correct answer, for all 8 cases. The predicate was right; the first probe
measured the wrong thing.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A counter sale's branch reaches the `outlet_id` column | `supabase-orders.test.ts:branch attribution` | unit | PASS |
| 2 | A malformed blob branch yields null, not an invalid uuid | `supabase-orders.test.ts:ignores a blank or non-string branch` | unit | PASS |
| 3 | A single-location register writes exactly what it writes today | `supabase-orders.test.ts:leaves outlet_id null` | unit | PASS |
| 4 | All six order reads are narrowed to the account's branch | `supabase-adapter.test.ts:branch-scoped reads` | unit | PASS |
| 5 | The tenant filter survives alongside the branch filter | `supabase-adapter.test.ts:still filters the tenant` | unit | PASS |
| 6 | A store-wide account's query is unchanged | `supabase-adapter.test.ts:adds no branch filter` | unit | PASS |
| 7 | An out-of-branch realtime payload does not refetch or chime | `supabase-realtime.test.ts:isOrderChangeInScope` | unit | PASS |
| 8 | The branch is read from `customer_data` when the column is empty | `supabase-realtime.test.ts:falls back to the branch in customer_data` | unit | PASS |
| 9 | The dispatch hook uses the account scope, never the viewing scope | `branch-read-scoping.test.ts` | guardrail | PASS |
| 10 | A re-resolved branch triggers a re-read | `branch-read-scoping.test.ts:re-reads when the account's branch changes` | guardrail | PASS |
| 11 | Only a store-wide account may manage branches | `outlets-manage-guard.test.ts:canManageOutlets` | unit | PASS |
| 12 | The outlets actions check the caller, not an argument | `outlets-manage-guard.test.ts:outlets server actions` | guardrail | PASS |
| 13 | Editing another branch's order is refused | `order-edit-guards.test.ts:canEditOrder branch scope` | unit | PASS |
| 14 | A final-status refusal outranks a branch refusal | `order-edit-guards.test.ts:reports the final-status refusal ahead` | unit | PASS |
| 15 | Order writes are narrowed in the write's own WHERE clause | `supabase-adapter.test.ts:branch-scoped writes` | unit | PASS |
| 16 | Omitting a scope stays permissive (no regression) | `order-edit-guards.test.ts:stays permissive`, `supabase-adapter.test.ts:defaults to store-wide` | unit | PASS |

## Suite results

```
webnegosyo-app: 72 suites, 1158 tests — all pass; npx tsc --noEmit clean
web:           294 suites, 3555 tests — all pass (1 suite / 8 tests pre-existing skips)
lint:          clean on every changed file
```

`npx tsc --noEmit` at the repo root reports errors in five **pre-existing** test files
(`tests/integration/inventory-live-e2e.test.ts`, `tests/product-detail-content.test.tsx`,
`tests/product-detail-theme.test.ts`, `tests/unit/api/inventory-order-stock.test.ts`).
`src/` is clean and none of the changed files appear. These were failing before this work
and are not addressed here.

## Known gaps — explicitly not done

- **Nothing has run on a device.** All evidence is unit tests, guardrail tests, and SQL
  probes. Realtime delivery is still unobserved end-to-end; it cannot be simulated from
  Node with the anon key, because Realtime applies the connected user's RLS. This is the
  single largest remaining unknown.
- **No live tenant exercises any of this.** 0 accounts are branch-scoped and 0 orders
  carry a branch, so every guard added here is inert until a merchant assigns one. That
  makes the change safe to ship and also means production has proved nothing.
- **Convex-backed tenants cannot be server-scoped.** The branch sits in an unindexed
  `customerData` blob. Those ~45 tenants keep client-side filtering and its 2,000-order
  window. Not a gap that can be closed at this layer.
- **Phase 5 (in-app team and branch management) and phase 6 (branch-targeted push) are
  untouched.** Staff creation is still web-only, and every device still rings for every
  branch.
- **`canManageOutlets` has no mobile copy.** The merchant app cannot manage outlets yet;
  when `team.tsx`/`branch-edit.tsx` land they must port it, the way
  `staff-permissions.ts` is ported.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — reads | `d218fd8` test: require order reads to be narrowed to the account's branch |
| GREEN — reads | `314e253` feat: narrow a branch account's order reads to its own branch |
| RED — writes | `9e45b7a` test: require branch guards on outlet and order writes |
| GREEN — writes | `3b34df0` feat: guard branch and order writes against the wrong branch |

If these are squashed, this file is the surviving record of what was verified and how.
