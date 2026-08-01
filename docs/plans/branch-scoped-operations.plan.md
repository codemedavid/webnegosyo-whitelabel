# Plan: Branch-scoped operations — remaining work

**Source:** continuation of the inline plan from the 2026-07-29 session.
**Branch:** `feat/platform-supabase-order-parity`
**Evidence so far:** `docs/testing/branch-scoped-staff.tdd.md`
**Complexity:** Large (4 independent shippable slices)

## Where we are (revised 2026-07-29, after Slice A + C1)

Done and committed (migration applied 2026-07-29, 157 accounts all store-wide):

| Piece | Location |
|---|---|
| `app_users.outlet_id` + per-branch staff cap + tenant-match trigger | `supabase/migrations/20260802120000_branch_scoped_staff.sql` |
| Shared scoping rules (100% covered) | `src/lib/outlets/branch-scope.ts` |
| Query/row scoping + `Order not found` guard | `src/lib/outlets/branch-scope-query.ts` |
| Branch-aware staff CRUD, `verifyStaffManager` | `src/lib/staff-service.ts`, `src/lib/admin-service.ts` |
| Migration-safe admin row read | `src/lib/queries/fetch-app-user-scope.ts` |
| Branch picker + badge | `src/components/admin/staff-management-card.tsx` |
| Web admin order reads scoped (platform Supabase only) | `src/lib/orders-service.ts` |
| **Slice A** — POS + QR-handoff orders stamped with the creating branch | `webnegosyo-app/lib/pos-order.ts`, `app/(main)/scan.tsx`, `lib/order-outlet.ts` |
| **Slice C1–C3** — app session carries `outletId`/`outletName`; app copy of the rules | `webnegosyo-app/lib/session-resolve.ts`, `stores/auth-store.ts`, `lib/branch-scope.ts` |

**The load-bearing gap:** `filterOrdersToScope` exists in the app and is
19/19 green, but **no screen calls it**. A branch account today still sees every
branch's orders. The module is inert until Slice C5 lands.

**Nothing is live for a merchant yet**: no tenant has `multi_branch_enabled` on,
and no account has a non-null `outlet_id` — so shipping the slices below is
still zero-regression for existing stores.

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

## ~~Slice A — Attribution~~ ✅ DONE

Storefront checkout stamps via `resolveOrderOutlet`; the POS stamps the
signed-in account's branch through `withOrderOutlet`; `scan.tsx` stamps the
scanning staffer's branch onto QR handoffs. Historic orders were **deliberately
left NULL** — they surface as an explicit "Unassigned" bucket in Slice D rather
than being guessed at.

## ~~Slice C5 — Make the app actually use the filter~~ ✅ DONE (2026-07-29)

The one change that turns branch scoping from code into behaviour. Per-screen,
because `useSafeQuery` in `lib/hooks.ts` is generic across refs — filtering
there would corrupt non-list results such as `getDashboardStats`.

| Screen | File | What to filter |
|---|---|---|
| Orders list | `app/(main)/orders.tsx` | the order array before render |
| Dashboard | `app/(main)/dashboard.tsx` | live queue; **stats are pre-aggregated server-side and cannot be filtered client-side** — see the caveat below |
| POS incoming | `app/(main)/pos.tsx`, `components/pos/IncomingOrdersSheet.tsx` | queue rows |
| Order alerts | `components/GlobalOrderAlerts.tsx` | do not ring for another branch |
| Analytics / trends / product analytics | `app/(main)/analytics.tsx`, `trends.tsx`, `product-analytics.tsx` | derived from order lists — filter at the source list |

**Caveat to decide, not to paper over:** `getDashboardStats` returns totals
computed in Convex over the whole tenant. A branch account would see its own
order list beside a store-wide revenue number. Either (a) derive the branch's
stats client-side from the filtered list, or (b) label the tile "All branches".
(a) is honest and costs one helper; (b) is a lie unless labelled. **Recommend
(a)**, with a written note where the 2000-order window makes it approximate.

6. Header shows the branch name, so a staffer cannot mistake whose queue it is.
7. Test asserting the web and app permission-registry copies agree (the
   3-copy drift risk in the table below).

**Validate:** `cd webnegosyo-app && npx jest`.

## ~~Slice B — Scope the remaining web read paths~~ ✅ DONE (2026-07-29)

Only the platform-Supabase path is scoped today. The other two backends leak.

1. **Convex path** — `src/components/admin/convex-orders-wrapper.tsx` and the
   dashboards reading from it. The branch sits in unindexed `customerData`, so
   apply `scopeOrderRows` to the fetched result. Accept the ~2000-order window
   ceiling; note it in the UI copy, do not hide it.
2. **Tenant-owned Supabase** — `getTenantSupabaseOrdersPage` in
   `src/lib/tenant-order-queue.ts`, consumed by
   `src/app/[tenant]/admin/orders/page.tsx`. Same technique.
3. **Realtime** — `src/hooks/use-realtime-orders.ts` must not fire a chime or a
   browser notification for another branch's order.

**Validate:** each surface unit-tested through the pure helpers; one manual pass
on a tenant with two branches.

## ~~Slice D — Owner cross-branch analytics (the original ask)~~ ✅ DONE (2026-07-29)

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

## Suggested order (revised)

**All four slices are done.** What remains is the follow-on work below, none of
which blocks shipping what is built.

| Follow-on | Why it is still open |
|---|---|
| App `analytics` / `trends` / `product-analytics` screens are unscoped | They aggregate inside their own Convex queries rather than over an order list, so each needs the treatment the dashboard tiles got — not a one-line filter |
| Web comparison covers the platform backend only | Convex and tenant-owned projects keep the branch in an unindexed blob; gated behind the indexed `outletId` work below |
| Enable `multi_branch_enabled` on a real tenant | Everything above has been proven by test but never seen by a merchant: no tenant has the flag on and no account has a non-null `outlet_id` |

## Acceptance

- [x] Every order-creating path stamps a branch (or is documented as unstamped)
- [x] No merchant surface shows a branch account another branch's orders —
      except the app's analytics/trends/product-analytics screens, recorded
      above as open
- [x] The merchant app header names the branch the session is scoped to
- [x] The owner can compare branches side by side, with Unassigned visible
- [ ] `npx jest` green (excluding the untracked `e2e/` Playwright artifact),
      `npx tsc --noEmit` clean under `src/`, `npx next lint` clean
- [ ] Evidence appended to `docs/testing/branch-scoped-staff.tdd.md`
