# TDD Evidence — Platform-DB Audit Fixes (2026-08-29)

## Source

No plan file. Scope came from the same-day audit ("does webnegosyo-app work with
the platform database, and check bugs/vulnerabilities"), which found 8 app bugs
and 2 CRITICAL RLS vulnerabilities plus Supabase advisor findings. This run
fixed all of them.

## User journeys

- As a branch manager, I want orders attributed by the `outlet_id` column to
  appear in my queue, so a counter sale is never invisible to the branch that
  rang it up.
- As a kitchen cook, I want a new ticket's line items to appear immediately,
  not after a 15-second poll of a 10,000-row join.
- As a cashier, I want a status tap that wrote nothing (moved/deleted order) to
  say so instead of pretending success, and a hung platform call to error out
  instead of freezing the register.
- As a merchant, I want editing an order's quantity to keep "(Large)" and
  bundle markers on the chit and receipt.
- As an owner switching stores or periods, I want a loading state instead of
  the previous store/period's numbers.
- As the platform operator, I want the anon key unable to inject orders into
  any tenant or items into any existing order.

## Checkpoint commits (all on `main`)

| Stage | Commit | Evidence |
|---|---|---|
| Refactor (test enabler) | `d57ec49e` | extraction of `usePlatformQuery` into a leaf module; suite stayed green (136/136 backend tests) |
| RED | `a03b6fbc` | `npx jest lib/backends lib/order-edit-cart.test.ts` — 10 new tests failed for the intended defects (list in commit body) |
| GREEN | `e76673ef` | same targets + `lib/pos-cart` + `lib/branch-read-scoping` — 148/148 pass |
| DB fix | `66ed62dc` (repo mirror) | applied live via MCP migrations, probed as `anon` (below) |

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | `toOrderDto` carries `outlet_id`; `getOrderOutletId` attributes column-only and blob-only rows | `lib/backends/supabase-orders.test.ts` "branch attribution on the order DTO" (3 tests) | PASS |
| 2 | `orders:getAllOrderItems` is realtime-backed (60s safety poll when connected, instant refresh on order change) | `lib/backends/supabase-realtime.test.ts` "order line items" | PASS |
| 3 | `getAllOrderItems` orders `orders(created_at)` desc before the 10k cap | `lib/backends/supabase-adapter.test.ts` "getAllOrderItems ordering" | PASS |
| 4 | `updateOrderStatus`/`updatePaymentStatus` throw when the UPDATE matched no row | `supabase-adapter.test.ts` "silent no-op writes" (2 tests; 4 existing patch tests updated to the read-back contract) | PASS |
| 5 | Malformed period stats args are refused with an actionable error (no bare RangeError) | `supabase-adapter.test.ts` "period stats input validation" | PASS |
| 6 | Revise carries `variation` + bundle/upsell metadata through delete-and-reinsert; hydrate→cart→serialize round-trips it; bundle lines never merge with identical standalone lines | `lib/backends/order-revise.test.ts` "legacy and bundle field carry-through" (2), `lib/order-edit-cart.test.ts` "metadata carry-through" (3) | PASS |
| 7 | `usePlatformQuery` re-arms `isLoading` on args/tenant change (not on realtime status flips) | `lib/backends/use-platform-query.test.tsx` (renderHook) | PASS |
| 8 | Every platform read/write is bounded by a 12s timeout (GoTrue-stall freeze can no longer hang a screen or a tender) | `lib/backends/platform-call.test.ts` (4), `use-platform-query.test.tsx` "surfaces an error… when the read hangs" | PASS |

Infra: `jest.config.js` components project now also roots `lib/` so `lib/**/*.test.tsx` hook tests run.

## Live-DB verification (RLS fixes, migrations `20260829130000` + `20260829140000`)

Probed via SQL as `set local role anon`, all in rolled-back transactions:

- Legit checkout (pending order into active tenant + its items, triggers firing): **allowed**, before and after the PUBLIC-execute revoke.
- Order insert with `status='confirmed'` (queue-jumping): **refused** (42501).
- Item insert into a day-old order (leaked id): **refused** (42501).
- Advisors after: 0 ERROR; remaining WARNs are two intentional grants
  (`order_accepts_anon_items` → anon, it is the RLS predicate;
  `initialize_order_types_for_tenant` → authenticated, it is the admin RPC)
  and the Auth "leaked password protection" toggle, which is a dashboard
  setting SQL cannot flip.

Finding recorded, not a regression: anon `INSERT … RETURNING` on `orders`
fails identically under the OLD open policy (no anon SELECT policy exists), so
the customer mobile app's `.insert().select().single()` platform path has never
succeeded; its code already treats that as a soft failure and proceeds to
Messenger.

## Coverage and known gaps

- Full suite at GREEN: 219 suites passing; the only failing suites belong to a
  concurrent session's in-flight service-charge RED work (their commits
  `6d293ea4` onward), not to this change set.
- Known gap (documented, deliberate): metadata carry-through (#6) is threaded
  through `OrderLineCarryover`; orders whose variation exists ONLY as the
  legacy string still do not surface that variation inside the edit UI's
  modifier sheet (pre-existing hydration gap) — but it is no longer destroyed
  on save.
- The anon item-insert window (parent pending, <15 min) is a bounded residual:
  an attacker would need to guess a fresh order's UUID within 15 minutes.
