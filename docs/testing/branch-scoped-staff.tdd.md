# TDD evidence — branch-scoped admins, staff, and cross-branch analytics

**Source plan:** the inline plan in this session (branch admins + branch staff +
one merchant app scoped to a branch + owner cross-branch analytics). No
`*.plan.md` artifact was produced; journeys below were written during this run.

**Scope shipped so far:** Phases 1–3 (schema, shared scoping rules, staff
management back end). Phases 4–7 are listed as known gaps at the bottom.

## Decisions taken without an explicit answer

The user replied "proceed" without answering four open questions. These
defaults were applied and are reversible:

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Staff cap | 3 **per branch** (store-wide accounts keep their own pool of 3) | A store-wide cap of 3 leaves a five-branch business sharing three logins |
| 2 | Who creates branch staff | The owner, **and** a branch admin for its own branch (new `branch_staff` permission) | Otherwise every branch's hiring routes through the owner |
| 3 | Convex push targeting | Deferred to a separate ship | Needs a schema sweep across every tenant deployment plus an app rebuild |
| 4 | One merchant app | Yes — `com.webnegosyo.admin`, scoped per session | Matches the existing single-app architecture |

## User journeys

1. As a business owner, I want to create an account that belongs to one branch,
   so that a branch's people see only that branch's work.
2. As a business owner, I want each branch to have its own staff allowance, so
   that opening a fifth branch does not require deleting someone's login.
3. As a branch admin, I want to add, edit, and remove my own branch's staff, so
   that the owner is not a bottleneck for every hire.
4. As a business owner, I want a branch admin to be unable to touch another
   branch, or to mint a store-wide account, so that the scope is real.
5. As anyone signing in to the admin, I want the admin to keep working during
   the window between a deploy and its migration.

## Task report

### 1. Shared branch-scoping rules (`src/lib/outlets/branch-scope.ts`)

Decides which branch an account is confined to, which orders that scope may
see, and whose staff it may manage — one pure module for the web admin, the
merchant app, and the POS, mirroring `staff-permissions.ts`.

- RED: `npx jest tests/unit/branch-scope.test.ts` →
  `Cannot find module '../../src/lib/outlets/branch-scope'`; `Tests: 0 total`.
  Compile-time RED against the missing implementation.
- GREEN: same command → `Tests: 36 passed, 36 total`.
- Guarantees: `outlet_id` NULL/blank reads as every branch (so no account that
  exists today changes); owners and superadmins are never confined; an
  unattributed order is hidden from a branch account but visible to the owner;
  the branch is read identically from the `orders.outlet_id` column and from
  `customer_data` (the Convex carrier).

### 2. Schema (`supabase/migrations/20260802120000_branch_scoped_staff.sql`)

Nullable `app_users.outlet_id`, a CHECK keeping owners unconfined, a trigger
rejecting a branch from another store, and a per-branch rewrite of
`enforce_staff_limit`.

- Validation: `npx tsc --noEmit` → no errors under `src/`. **Not yet applied to
  the database** — see gaps.

### 3. Branch-aware staff service (`src/lib/staff-service.ts`)

- RED: `npx jest tests/unit/staff-service-branch.test.ts` →
  `Tests: 17 failed, 2 passed, 19 total`. The two passes were cap cases the old
  store-wide rule already satisfied, not false greens.
- GREEN: `npx jest tests/unit/staff` → `Tests: 84 passed, 84 total`
  (4 suites, including the pre-existing `staff-service.test.ts` unchanged).
- Guarantees: a branch is validated against the store's own branches *before*
  the auth user is created, so a rejected branch cannot strand a login; the cap
  is counted per branch and excludes the owner; a branch admin can create,
  re-permission, re-password, remove, and move only its own branch's people,
  and can never mint a store-wide account.

### 4. Resilient admin row read (`src/lib/queries/fetch-app-user-scope.ts`)

Every web-admin action reads `app_users`, so naming `outlet_id` there before
the migration lands would 400 the entire admin — the failure mode
`fetch-tenant-by-slug.ts` exists to prevent.

- RED: `npx jest tests/unit/fetch-app-user-scope.test.ts` →
  `Cannot find module '@/lib/queries/fetch-app-user-scope'`.
- GREEN: same command → `Tests: 6 passed, 6 total`.
- Guarantees: on SQLSTATE 42703 the read retries with the pre-branch
  projection and the account degrades to store-wide; unrelated errors are not
  retried; a missing row is not reported as an error.

### 5. Scoping the order reads (`src/lib/outlets/branch-scope-query.ts`)

Applies an account's branch to the queries themselves, and wires it into
`getOrdersByTenant` / `getOrderById` — the two functions every web-admin order
read funnels through.

- RED: `npx jest tests/unit/branch-scope-query.test.ts` →
  `Test Suites: 1 failed`, `Tests: 0 total` (module absent).
- GREEN: same command → `Tests: 11 passed, 11 total`.
- Regression check: `npx jest` → `Tests: 3469 passed, 8 skipped`,
  `283 suites passed`. `npx tsc --noEmit` → no errors under `src/`.
- Guarantees: the branch filter is applied in SQL, so another branch's rows
  never leave the database and the paginated `count` describes the store the
  account can actually see (a client-side filter would return a 20-row page
  with 3 visible); a single order is checked after fetch and refused as
  `Order not found`, so the refusal cannot confirm which ids exist elsewhere;
  an all-branch account adds no filter and gets the identical query it does
  today.

### 6. Branch picker in the settings card (`staff-management-card.tsx`)

Makes the feature reachable: a radio group in the add-staff dialog, a branch
badge per member, and the card itself now shown to a branch admin.

- RED: `npx jest tests/unit/staff-branch-picker.test.tsx` →
  `Tests: 6 failed, 3 passed, 9 total`. The 3 passes are the "no branches, no
  control" assertions, which hold trivially before the feature exists.
- GREEN: same command → `Tests: 9 passed, 9 total`; `npx jest tests/unit/staff`
  → `Tests: 93 passed`, 5 suites.
- Guarantees: with `outlets` empty (every single-location tenant) no branch
  control and no branch badge render at all; a new account defaults to "All
  branches"; a deleted branch renders as "Unknown branch" rather than leaking a
  raw uuid into the staff list.
- Native radios were chosen over the Select primitive so the control stays
  keyboard- and test-operable without pointer emulation.

### Migration applied

`20260802120000_branch_scoped_staff.sql` was applied via Supabase MCP on
2026-07-29. Post-apply verification query: `has_outlet_column: 1`,
`total_accounts: 157`, `branch_scoped_accounts: 0`, `has_scope_check: 1`,
`has_tenant_trigger: 1`, `has_staff_limit_trigger: 1`, `outlets_rows: 4` — every
existing account still resolves to the whole store, and both new triggers are
inert until a branch is assigned.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An account with no branch sees the whole store (every account that exists today) | `tests/unit/branch-scope.test.ts:resolveBranchScope` | unit | PASS |
| 2 | Owners and superadmins are never confined to one branch | `tests/unit/branch-scope.test.ts:resolveBranchScope` | unit | PASS |
| 3 | A branch account sees its own orders on both the column and `customer_data` backends | `tests/unit/branch-scope.test.ts:isOrderInScope` | unit | PASS |
| 4 | An unattributed order is hidden from a branch account, shown to the owner | `tests/unit/branch-scope.test.ts:isOrderInScope` | unit | PASS |
| 5 | An all-branch filter returns the caller's own array (no copy of a 2000-order page) | `tests/unit/branch-scope.test.ts:filterOrdersToScope` | unit | PASS |
| 6 | A branch admin manages only its own branch, never a store-wide account | `tests/unit/branch-scope.test.ts:canManageBranchStaff` | unit | PASS |
| 7 | A branch from another store is rejected | `tests/unit/branch-scope.test.ts:resolveStaffOutletId` | unit | PASS |
| 8 | The staff cap is per branch; a full branch does not block another branch or the store-wide pool | `tests/unit/staff-service-branch.test.ts:staff limit per branch` | unit | PASS |
| 9 | A rejected branch leaves no auth user behind | `tests/unit/staff-service-branch.test.ts:refuses a branch the store does not own` | unit | PASS |
| 10 | Moving into a full branch is refused; the owner can never be moved | `tests/unit/staff-service-branch.test.ts:updateStaffBranch` | unit | PASS |
| 11 | Permission, password, removal, and move writes all re-check the branch | `tests/unit/staff-service-branch.test.ts:managing an existing account` | unit | PASS |
| 12 | Existing single-location staff behaviour is unchanged | `tests/unit/staff-service.test.ts` (untouched) | unit | PASS |
| 13 | A pending migration degrades the admin to store-wide instead of 400ing it | `tests/unit/fetch-app-user-scope.test.ts` | unit | PASS |

## Coverage

```
npx jest tests/unit/branch-scope tests/unit/staff tests/unit/fetch-app-user-scope --coverage
                          | % Stmts | % Branch | % Funcs | % Lines
 staff-service.ts         |     100 |    98.14 |     100 |     100
 outlets/branch-scope.ts  |     100 |      100 |     100 |     100
 queries/fetch-app-user-scope.ts | 100 | 91.66 |     100 |     100
Tests: 126 passed, 126 total
```

Whole-project validation: `npx tsc --noEmit` reports no errors under `src/`
(pre-existing errors in `tests/` are untouched by this work).
`npx next lint` on all five changed source files: no warnings or errors.

## Known gaps

1. ~~The migration is not applied.~~ Applied 2026-07-29; see above.
2. **Phase 4 is partial.** The platform-Supabase web-admin path
   (`getOrdersByTenant`, `getOrderById`) is scoped. Still unscoped:
   - the Convex order path (`ConvexOrdersWrapper` and the dashboards that read
     from it) — needs `scopeOrderRows` applied to the fetched result, since the
     branch lives in unindexed `customer_data` there;
   - tenant-owned Supabase projects (`getTenantSupabaseOrdersPage`);
   - the POS, which neither reads through `getOrdersByTenant` nor stamps a
     branch onto the orders it creates;
   - **no branch-aware RLS policy on `orders`.** The scope is enforced in the
     service layer, which every admin read goes through, but not by the
     database. Adding it means rewriting the existing tenant-isolation SELECT
     policy (PERMISSIVE policies OR together, so a new policy cannot restrict),
     which deserves its own reviewed change.
3. **Phase 5 (merchant app session) not started** — `session-resolve.ts` does
   not yet select or carry `outlet_id`.
4. **Phase 6 (cross-branch analytics) not started** — no
   `branch-analytics.ts`, no Branches comparison view on web or in the app.
5. **Phase 7 (push targeting) deliberately deferred** — `getAllTokens` still
   notifies every device of the tenant, so branch staff will be alerted for
   other branches' orders until the Convex schema sweep and app rebuild ship.
6. **No UI yet for assigning a branch** — `staff-management-card.tsx` has no
   branch selector, so `outletId` can currently only be set by a direct call to
   `createStaffAction` / `updateStaffBranchAction`.
7. **Enforcement on Convex is UI-level only.** Convex mutations are
   unauthenticated by existing design, so branch scoping there shapes reads
   rather than enforcing a boundary. Only the platform-Supabase path can carry
   an RLS-enforced scope.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`, in order:
`b77fc80` (RED: branch scope) → `62d731b` (GREEN) → `97c8c14` (migration) →
`76d1715` (RED: branch staff service) → `608b0b1` (GREEN) →
`4ed11a8` (GREEN: branch admin authority + resilient admin read).

## Follow-ups opened by the UI work

- **No UI to move an existing account between branches.** `updateStaffBranch`
  and `updateStaffBranchAction` exist and are tested, but nothing calls the
  action yet — the edit dialog still only edits permissions.
- **Unrelated pre-existing failure:** `npx jest` reports one failing suite,
  `e2e/multi-branch-selection-timing.spec.ts`. That path is **untracked** in
  git (a working-tree artifact from another session) and fails because Jest's
  `*.spec.ts` pattern sweeps up a Playwright spec. It is unrelated to this work
  and was left untouched.

---

## Slice A — order attribution (2026-07-29, second session block)

**Source plan:** `docs/plans/branch-scoped-operations.plan.md`, Slice A.

### Verification step (the plan required this before any code)

Traced the order-creating paths rather than assuming:

| Path | Stamped a branch before this work? |
|---|---|
| Storefront checkout | Yes — `resolveOrderOutlet` → `orders.outlet_id` + `customer_data` |
| POS / counter sale (`buildPosOrder`) | **No** — assembled `customerData` with no branch |
| App session | Did not carry a branch at all |

### 7. Counter sales carry a branch

- RED: `cd webnegosyo-app && npx jest lib/pos-order-outlet` →
  `TS2353: 'outlet' does not exist in type 'Partial<PosOrderContext>'`,
  `Tests: 0 total`. Compile-time RED against the missing seam.
  (First run also failed on a wrong test fixture of mine — `PosCartLine`
  needs `key`/`unitPrice`; corrected to build through `addLine`, which is
  the fixture the existing `pos-order.test.ts` uses.)
- GREEN: `npx jest lib/pos-order` → `Tests: 25 passed`, 2 suites.
- Guarantees: a sale rung at a branch records that branch; a single-location
  register adds no keys at all (byte-for-byte today's order); caller-supplied
  `customerData` cannot forge the branch, because the stamp is written last;
  the payment blob and any other assembled `customerData` survive intact.

### 8. The app session carries the branch

- RED: `npx jest lib/session-resolve-outlet` →
  `TS2724: has no exported member named 'needsOutletLookup'` plus
  `outlet_id does not exist in type 'AppUserRow'`.
- GREEN: `npx jest lib/session-resolve` → `Tests: 28 passed`, 2 suites.
- Whole app: `npx jest` → `Tests: 892 passed`, 56 suites; `npx tsc --noEmit`
  clean. Web unaffected: `npx jest tests/unit` → `3371 passed`, `tsc` clean
  under `src/`.
- Guarantees: only a branch-confined account triggers the branch lookup (an
  owner or superadmin never does, so no guaranteed-miss query); a branch row
  that cannot be read degrades to the store-wide view instead of locking the
  account out; a superadmin is never scoped, impersonating or not.
- Both entry points — cold start (`app/_layout.tsx`) and interactive login
  (`app/(auth)/login.tsx`) — were updated together, since that module exists
  precisely to stop those two from drifting.

### Still open in Slice A

- **Existing orders keep `outlet_id = NULL`** by decision — no branch is
  guessed for historic rows. They surface as "Unassigned" to the owner once
  Slice D builds that view; today they are simply invisible to branch accounts.
- `app/(main)/scan.tsx` also calls `createOrder`; it was **not** audited or
  stamped in this pass.

## Slice C foundation — the app's own branch rules

### 9. `webnegosyo-app/lib/branch-scope.ts`

- RED: `cd webnegosyo-app && npx jest lib/branch-scope` →
  `TS2307: Cannot find module './branch-scope'`, `Tests: 0 total`.
- GREEN: same command → `Tests: 19 passed, 19 total`.
- Whole app after the QR-handoff wiring: `npx jest` → `Tests: 911 passed`.
- **Not a blind copy of the web module.** Orders reach the app from Convex,
  where the blob is `customerData` (camelCase); the web module reads
  `customer_data`, the platform-Supabase column name. Reading the wrong key
  would hide every order from every branch account, and the symptom would look
  like an empty store rather than a bug. The tests pin both keys.
- Guarantees: a demo session and a superadmin (impersonating or not) are never
  confined; an explicit `outlet_id` column wins over the blob; a malformed or
  missing blob degrades to "no branch" instead of throwing; `undefined` (a
  Convex query still loading) filters to an empty list so screens need no null
  check.

### 10. QR-handoff orders stamped (closes the Slice A gap)

`app/(main)/scan.tsx` now stamps the scanning staff member's branch over
whatever the handoff payload carried — the person scanning *is* the branch
taking the order. Covered by `order-outlet.ts`'s own tests rather than a screen
test; the wiring itself is a single call.

## Foreign artifacts in this working tree

Another session is committing to this same branch concurrently. Observed and
deliberately left untouched:

- `e2e/` — untracked Playwright specs; Jest's `*.spec.ts` pattern sweeps them
  up, which is the one failing suite in the web `npx jest` run.
- `webnegosyo-app/lib/order-balance.test.ts` — untracked RED reproducer for a
  module that does not exist yet; it is the sole `tsc --noEmit` error in the
  app package.
- commit `454b1dd test: add reproducer for the branch question as its own
  checkout screen` — not from this work.

Neither belongs to this feature; do not attribute their state to it.

## Task 11 — Slice C5: the app actually uses the filter (2026-07-29)

Until this block, `filterOrdersToScope` existed and was 19/19 green but **no
screen called it**: a branch account still read every branch's orders. This
closes that.

### 11a — dashboard queue and stat tiles

The flat filter does not fit either dashboard shape. The live queue arrives
grouped by status (`Record<status, Order[]>`), and the stat tiles are
aggregated inside Convex over the whole tenant — a branch account would have
read store-wide revenue above its own order list.

- RED: `cd webnegosyo-app && npx jest lib/branch-dashboard`
  → `Cannot find module './branch-dashboard'`, `Tests: 0 total`.
  Commit `0b0fa40 test: add reproducer for branch-scoped dashboard queue and stats`.
- GREEN: `Tests: 13 passed, 13 total`.
  Commit `d71ea01 feat: derive branch-scoped dashboard queue and stats`.

Two decisions worth recording:

- **Emptying a status bucket keeps its key.** The status pipeline renders one
  column per status; dropping the key would read as a broken screen rather than
  as "no orders here".
- **Branch stats are re-derived on the client, not relabelled.** The
  alternative was labelling the tile "All branches", which is only honest if it
  is actually labelled — and an unlabelled mismatch is how merchants stop
  trusting the numbers. `deriveStatsForScope` mirrors the Convex handler's
  arithmetic exactly (cancelled excluded from revenue/count/average, still
  counted in the status breakdown) so a branch account and the owner cannot
  disagree about the same day's takings.

### 11b — the screens

Commit `ad8cc68 feat: scope the merchant app's order surfaces to the signed-in branch`.

| Surface | File | Seam |
|---|---|---|
| Orders list | `app/(main)/orders.tsx` | `allOrders`, before counts/search/sort so the pill counts describe the visible list |
| Dashboard queue | `app/(main)/dashboard.tsx` | `filterQueueToScope` |
| Dashboard tiles | `app/(main)/dashboard.tsx` | `deriveStatsForScope` over a `getOrders` window; store-wide accounts pass `"skip"` and keep the cheaper server aggregate |
| POS incoming | `app/(main)/pos.tsx` | `filterQueueToScope` before `selectIncomingOrders` |
| Ringtone | `components/GlobalOrderAlerts.tsx` | another branch's order must not ring this device |

`useBranchScope` (`lib/use-branch-scope.ts`) is the single place the four auth
fields become a scope — a screen that forgot one of them would leak.

The filters take `T extends object` rather than `T extends ScopedOrderLike`:
every field on that interface is optional, making it a TypeScript *weak type*
that rejects concrete order types outright (`TS2345: has no properties in
common`). The branch is read structurally instead.

### 11c — branch name in the header

`app/(main)/dashboard.tsx` renders `outletName` under the store name, so a
staffer moving between outlets cannot mistake one branch's numbers for
another's. Commit `3be26ae`.

### 11d — permission registry drift (a real bug, caught)

The plan called for a test asserting the web and app permission registries
agree. It found actual drift: `branch_staff` had been added to
`src/lib/staff-permissions.ts` in Task 3 and **never** to
`webnegosyo-app/lib/staff-permissions.ts`.

- RED: `npx jest tests/unit/staff-permissions-parity` → `Tests: 2 failed`.
  Commit `418aad6 test: add reproducer for staff permission registry drift`.
- GREEN: `Tests: 2 passed`. The app copy gained a runtime
  `STAFF_PERMISSION_KEYS` array (a union type cannot be compared at runtime)
  including `branch_staff`. Commit `3be26ae`.

### 11e — stale closure in the register

`npm run lint` surfaced `pos-tender.tsx:217 react-hooks/exhaustive-deps:
missing dependencies 'outletId' and 'outletName'` — introduced by Slice A. A
session whose branch resolved after the callback was first built would have
rung sales up against a stale or absent branch. Fixed in commit `8aed0c0`.

### Validation for this block

| Command | Result |
|---|---|
| `cd webnegosyo-app && npx jest` | `Tests: 1008 passed, 64 suites` |
| `cd webnegosyo-app && npx tsc --noEmit` | clean except the foreign `lib/order-balance.test.ts` |
| `npx jest tests/unit` | `Tests: 3392 passed, 272 suites` |
| `npm run lint` | no findings in any file changed by this block |

`npm run lint` reports 88 errors / 713 warnings repo-wide, overwhelmingly in
`webnegosyo-desktop` bundled output. None are in files this block touched;
they pre-date it and were left alone.

### Migrations

All 63 local migrations are applied. `mcp__supabase__list_migrations` confirms
`branch_scoped_staff` (`20260729091407`) and the other session's
`order_edit_and_payments` (`20260729103802`) are both live. Nothing was
applied in this block — there was nothing pending.

Live state at the time of writing: `app_users.outlet_id` and `orders.outlet_id`
both exist, 4 outlets, 1 tenant with `multi_branch_enabled`, and **0
branch-scoped accounts** — so this block is zero-regression for every existing
store.

## Task 12 — Slice B: the two remaining web order backends (2026-07-29)

Before this, only the platform-Supabase read path was scoped. A branch account
on either of the other two backends still read every branch's orders.

### 12a — tenant-owned Supabase

- RED: `npx jest tests/unit/tenant-supabase-orders-branch` → `Tests: 2 failed, 4 passed`.
  Commit `72a7832 test: add reproducer for branch scoping on the tenant Supabase backend`.
- GREEN: `Tests: 49 passed` across the three tenant-Supabase suites (the two
  pre-existing ones included, so the change is additive).
  Commit `2d209f2 feat: scope tenant-Supabase order reads to the caller's branch`.

The filter goes into the SQL, not onto the result. These queries carry
`count: "exact"`; filtering afterwards would return a 20-row page with 3 rows
left, above a total describing a store the account cannot see. The scope is
resolved from the row `verifyTenantPermission` already returns, so the caller
that authorizes the read is the same one that scopes it — a screen cannot pass
its own.

**`scopeOrdersQuery` lost its `T extends EqQuery<T>` constraint.** The
self-referential form is more expressive, but PostgREST's builder types are deep
enough that resolving it raised `TS2589: Type instantiation is excessively
deep` at the new call site. It is now `<T>` with a checked cast; the existing
11 tests still pin the behaviour.

### 12b — the live order stream

- RED: `npx jest tests/unit/use-realtime-orders-branch` → `Tests: 3 failed, 3 passed`.
  Commit `cf7ae41 test: add reproducer for branch scoping on the live order stream`.
- GREEN: `Tests: 15 passed` across both realtime suites.
  Commit `6f78632 feat: keep the live order stream on the account's own branch`.

Not just a display concern: the wrapper plays a chime and raises a browser
notification with `requireInteraction: true` for every order it is handed. An
unscoped branch account is interrupted repeatedly, by orders from a branch it
cannot open, with a notification that does not dismiss itself.

The Postgres `filter` string carries one equality and it is already spent on
`tenant_id`, so the check happens in the handler.

**A bug this block introduced and then fixed:** defaulting `scope` to a
`{ kind: 'all' }` literal gave the effect a new identity on every render, so
each connection-status change tore the channel down and rebuilt it. The
pre-existing test `turns the live indicator on only once the channel is
subscribed` caught it. Fixed with a module-scoped default plus a `scopeRef`, so
a caller rebuilding its scope object cannot resubscribe the channel while a
genuine branch change still applies on the next event.

### 12c — Convex, and a silent-outage bug

The web helpers read `customer_data`. **Convex stores `customerData`** — its
schema declares `customerData: v.optional(v.any())` and its documents are
camelCase throughout. Every Convex order therefore looked unattributed, which
would have shown a branch account an empty queue on a store taking orders
normally: an outage, not a visible scoping bug.

- RED: `npx jest tests/unit/order-outlet-convex-key` → `Tests: 3 failed, 4 passed`.
  Commit `b4dc6fa test: add reproducer for reading a Convex order's branch`.
- GREEN: `Tests: 7 passed`. Commit `8d9b43c feat: scope the Convex order queue
  to the account's branch`.

Convex has no index on the branch, so rows are narrowed after the query via
`scopeOrderRows`. That inherits the query's existing row ceiling — a branch on
a very busy store can fall off the end of the window. Documented at the prop;
the real fix is the indexed `outletId` in the deferred Convex ship.

### Validation for this block

| Command | Result |
|---|---|
| `npx jest tests/unit` | `Tests: 3411 passed, 275 suites` |
| `npx tsc --noEmit` | no errors under `src/` |
| `npm run lint` | no findings in any file changed by this block |

### Migrations

Nothing to apply. `mcp__supabase__list_migrations` shows all 63 local
migrations live. Slice B is code-only — it adds no column and reads
`orders.outlet_id`, which the applied `branch_scoped_staff` migration created.

## Remaining after this block

Slice D — cross-branch analytics, the original ask.

Still deferred: branch-aware RLS on `orders`, Convex push targeting (until it
lands **every branch device rings for every order**), and the UI to move an
account between branches. See `docs/plans/branch-scoped-operations.plan.md`.

Known gap in this block: the app's analytics, trends and product-analytics
screens were **not** scoped. They aggregate over their own queries rather than
an order list, so each needs the same treatment the dashboard tiles just got —
this is Slice D work, not a one-line filter.
