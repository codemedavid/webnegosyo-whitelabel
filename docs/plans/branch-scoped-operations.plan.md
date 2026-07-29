# Plan: Branch-scoped operations — remaining work

**Source:** continuation of the inline plan from the 2026-07-29 session.
**Branch:** `feat/platform-supabase-order-parity`
**Evidence so far:** `docs/testing/branch-scoped-staff.tdd.md`
**Complexity:** Large (4 independent shippable slices)

## Where we are

Done and committed (migration applied 2026-07-29, 157 accounts all store-wide):

| Piece | Location |
|---|---|
| `app_users.outlet_id` + per-branch staff cap + tenant-match trigger | `supabase/migrations/20260802120000_branch_scoped_staff.sql` |
| Shared scoping rules (100% covered) | `src/lib/outlets/branch-scope.ts` |
| Query/row scoping + `Order not found` guard | `src/lib/outlets/branch-scope-query.ts` |
| Branch-aware staff CRUD, `verifyStaffManager` | `src/lib/staff-service.ts`, `src/lib/admin-service.ts` |
| Migration-safe admin row read | `src/lib/queries/fetch-app-user-scope.ts` |
| Branch picker + badge | `src/components/admin/staff-management-card.tsx` |
| Web admin order reads scoped (platform Supabase) | `src/lib/orders-service.ts` |

**Nothing is live for a merchant yet**: no tenant has `multi_branch_enabled` on,
and no account has a non-null `outlet_id`.

## Patterns to mirror

| Category | Source | Pattern |
|---|---|---|
| Pure rule module | `src/lib/outlets/branch-scope.ts` | data + lookups only, no I/O, duplicated verbatim into the app package |
| Cross-package copy | `src/lib/staff-permissions.ts` ↔ `webnegosyo-app/lib/staff-permissions.ts` | "keep the two in sync" header; separate builds, no shared import |
| App session shape | `webnegosyo-app/lib/session-resolve.ts` | one module owns what a row means; cold start and login must not drift |
| App backend routing | `webnegosyo-app/lib/backends/route.ts` | pure `resolveRefRoute`, unit-tested with no React tree |
| Resilient projection | `src/lib/queries/fetch-app-user-scope.ts`, `fetch-tenant-by-slug.ts` | retry on SQLSTATE 42703 rather than 400 the surface |
| Migration style | `20260802120000_branch_scoped_staff.sql` | additive, nullable = today's meaning, manual rollback block |
| Tests | `tests/unit/*.test.ts(x)`, `webnegosyo-app/lib/*.test.ts` | AAA, behaviour-named, fakes over mocks |

---

## Slice A — Attribution: every order gets a branch (do this first)

Everything downstream is worthless if orders are not stamped. A branch account
sees nothing but its own branch, so an unstamped order is invisible to the
people who took it.

1. **Verify first** (do not assume): trace which paths create orders — the
   storefront checkout (already stamps via `resolveOrderOutlet`), the POS
   (`webnegosyo-app/lib/pos-order.ts`), and any admin-created order. Write down
   which ones set `outlet_id` / the `customer_data` carrier and which do not.
2. Stamp POS orders with the creating account's branch (`resolveBranchScope` →
   `withOrderOutlet`), since a counter sale belongs to the counter's branch.
3. Backfill decision for existing orders: leave them NULL ("Unassigned") and
   surface that bucket to the owner. Do **not** guess a branch for historic rows.

**Validate:** `npx jest tests/unit/…`; a POS order created by a branch account
appears in that branch's list and nowhere else.

## Slice B — Scope the remaining read paths

1. **Convex path** — `ConvexOrdersWrapper` and the dashboards reading from it.
   The branch is in unindexed `customer_data`, so apply `scopeOrderRows` to the
   fetched result. Accept the existing ~2000-order window ceiling; note it.
2. **Tenant-owned Supabase** — `getTenantSupabaseOrdersPage`, same technique.
3. **POS order queue** — `pos-incoming.ts` and the sales screens.
4. **Realtime** — `use-realtime-orders.ts` and the app's alert path must not
   ring a branch account for another branch's order.

**Validate:** each surface, unit-tested through the pure helpers; one manual
pass on a tenant with two branches.

## Slice C — Merchant app carries the branch

1. `webnegosyo-app/lib/branch-scope.ts` — verbatim copy of the web module, with
   the "keep in sync" header. Add a test asserting the two copies agree.
2. `session-resolve.ts`: select `outlet_id`, resolve the branch name, extend
   `SessionAuthPatch`; extend `auth-store.ts`. Demo mode and superadmin
   impersonation stay `kind: 'all'`.
3. Both entry points — cold start (`app/_layout.tsx`) and login
   (`app/(auth)/login.tsx`) — must set it, or the two drift.
4. Header shows the branch name, so a staffer cannot mistake whose queue it is.
5. Screens filter through `filterOrdersToScope`: dashboard, orders, POS,
   analytics, trends.

**Risk:** the app selects `outlet_id` from `app_users`; the column now exists,
so this is safe — but mirror the resilient-read pattern if the app can run
against an older database.

**Validate:** `cd webnegosyo-app && npm test`.

## Slice D — Owner cross-branch analytics (the original ask)

1. `src/lib/outlets/branch-analytics.ts` — pure: `groupOrdersByOutlet`,
   `compareBranches` → per-branch revenue, order count, AOV, top items,
   day-over-day trend. Unattributed orders surface as their own **Unassigned**
   row rather than being silently dropped.
2. Web: a **Branches** tab in the existing analytics surface — comparison table
   plus trend lines. Owner / `analytics` permission only; a branch account sees
   its own branch, not the comparison.
3. App: a **Branches** screen in the Insights workspace — register it in
   `lib/workspaces.ts` (a tab must belong to exactly one view).

**Validate:** unit tests on the pure module; totals across branches must equal
the store total including the Unassigned bucket.

---

## Deferred, with reasons

| Item | Why deferred |
|---|---|
| Branch-aware RLS on `orders` | Permissive policies OR together, so this means **rewriting** the tenant-isolation SELECT policy that governs every admin's order reads. Deserves its own reviewed change, not a side effect. |
| Convex push targeting (`outletId` on `orders` + `pushTokens`) | Needs a schema sweep across every tenant deployment (prebundle + `CURRENT_SCHEMA_VERSION` bump) plus an app rebuild. Until then **every branch device rings for every order** — state this in release notes. |
| UI to move an account between branches | `updateStaffBranch` + `updateStaffBranchAction` are built and tested; only the edit dialog is missing. |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unstamped orders invisible to the staff who took them | High | High | Slice A first; Unassigned bucket for the owner |
| Convex scoping is not a security boundary (unauth'd mutations by design) | Certain | Medium | Document; prefer `order_backend='platform'` for branch tenants |
| The 3-copy permission registry drifts | Medium | Medium | Test asserting web and app copies agree (Slice C1) |
| Feature ships dark — no tenant has `multi_branch_enabled` | Certain | Low | Enable on a staging tenant before Slice B |
| Convex client-side filtering hits the 2000-order window | Medium | Medium | Accept; fix with the indexed `outletId` in the deferred Convex ship |

## Suggested order

**A → B → C → D.** A is a correctness prerequisite; B makes the web trustworthy;
C is what the merchant actually holds; D is the owner-facing payoff. Each slice
is independently shippable and independently reviewable.

## Acceptance

- [ ] Every order-creating path stamps a branch (or is documented as unstamped)
- [ ] No merchant surface shows a branch account another branch's orders
- [ ] The merchant app header names the branch the session is scoped to
- [ ] The owner can compare branches side by side, with Unassigned visible
- [ ] `npx jest` green (excluding the untracked `e2e/` Playwright artifact),
      `npx tsc --noEmit` clean under `src/`, `npx next lint` clean
- [ ] Evidence appended to `docs/testing/branch-scoped-staff.tdd.md`
