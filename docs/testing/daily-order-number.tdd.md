# TDD Evidence — Daily-Resetting Per-Tenant Order Number

**Source plan:** conversational `/ecc:plan` (this session). No `.plan.md` artifact.
**Feature:** Every order gets a human-friendly display number (`01`, `02`, … `100+`)
that resets each day per tenant, is unique per (tenant, local day), stays findable,
and is separate from the UUID primary key. Shown on customer web + mobile, admin web,
the Messenger message, and the merchant app.

## User Journeys
1. As a customer, I see a short order number (`#05`) on the confirmation and tracking
   screens so I can reference my order.
2. As a merchant, I see the same number in the Messenger message, the admin orders list,
   the order detail, and the merchant app — so I can match the chat to the order in my queue.
3. As a merchant, order numbers reset to `#01` at the start of each local day and never
   duplicate within a day, even under concurrent checkout load.
4. As a merchant, I can search the admin orders list by order number.

## Decisions
- Reset boundary: `Asia/Manila` (new `tenants.timezone` column, default `'Asia/Manila'`).
- Existing orders: no backfill — they fall back to the UUID slice; numbering starts fresh.
- Messenger: message now leads with `Order #NN` (previously carried no id at all).

## Task Report

### 1. `formatDailyOrderNumber` helper (pure, RED→GREEN)
- RED: `tests/unit/order-number.test.ts` referenced missing `@/lib/order-number`
  → `Cannot find module` (compile-time RED, 0 tests ran).
- GREEN: after implementing the helper, `7/7` pass.
- Guarantees: 2-digit zero-pad, natural growth past 100, UUID-slice fallback,
  daily-number preferred over fallback, empty string when nothing known, and
  zero/negative daily numbers ignored in favor of the fallback.
- Ported verbatim to `mobile/lib/order-number.ts` and `webnegosyo-app/lib/order-number.ts`.

### 2. Supabase migration + atomic counter (integration, throwaway Postgres 16)
- `supabase/migrations/20260716120000_daily_order_number.sql`: `tenants.timezone`,
  `orders.daily_number` + `orders.order_date`, `daily_order_counters` table,
  `next_daily_order_number()` (SECURITY DEFINER, atomic `INSERT … ON CONFLICT DO UPDATE
  … RETURNING`), a BEFORE INSERT trigger, and a unique index
  `(tenant_id, order_date, daily_number)`.
- Verified against a disposable `postgres:16` container (`supabase/tests/daily_order_number_test.sql`):
  - Per-tenant sequence starts at 1; second tenant is independent.
  - Backdated (yesterday) order shows `1` for the prior date; today restarts fresh.
  - Duplicate `(tenant, date, number)` insert → `unique_violation` (rejected).
  - **Concurrency:** 20 parallel clients × 25 inserts = **500 concurrent inserts →
    500 distinct, contiguous numbers `1..500`, zero duplicates.**

### 3. Convex counter + schema
- `convex-template/convex/schema.ts`: `orders.dailyNumber` + `orders.orderDate`;
  new `dailyOrderCounters` table (`by_date` index).
- `convex-template/convex/orders.ts`: `allocateDailyOrderNumber` read-modify-write,
  called in `createOrder` **after** the `clientOrderId` idempotency guard (retries never
  consume a second number). Convex OCC serializes the counter update.
- `CURRENT_SCHEMA_VERSION` 12→13; `npm run convex:prebundle` re-ran. Confirmed the new
  symbols are present in `src/lib/convex-push-bundle.json`.

### 4. Messenger header (unit)
- `tests/unit/messenger-order-number.test.ts`: `3/3` pass — includes `Order #05` when a
  daily number exists, `Order #12AB34CD` fallback otherwise, and preserves the greeting line.

### 5. Display wiring (verified by build + typecheck)
- Web: order-tracking-client, order-card, order-detail-dialog, orders-list (+ search),
  convex-order-sheet. `TrackingData` carries `dailyNumber` from both backends.
- Mobile customer: order-confirmation, order-status (+ `CompletedOrderData.dailyNumber`).
- Merchant app: `OrderCard` number chip, order detail header.

## Test Specification

| # | Guarantee | Test / command | Type | Result |
|---|-----------|----------------|------|--------|
| 1 | Number formatting (pad, 100+, fallback, guards) | `tests/unit/order-number.test.ts` | unit | PASS (7) |
| 2 | Messenger message leads with the number | `tests/unit/messenger-order-number.test.ts` | unit | PASS (3) |
| 3 | Per-tenant sequence + daily reset + uniqueness | `supabase/tests/daily_order_number_test.sql` | integration | PASS |
| 4 | 500 concurrent inserts → 0 duplicates | parallel `psql` fan-out (see report §2) | integration | PASS |
| 5 | No regressions across web suite | full Jest run | regression | PASS (1245) |

## Validation Commands & Results
- `npm run build` → compiled successfully (after fixing a duplicate `Tenant.timezone`
  identifier — the field already existed; my redundant declaration was removed).
- Full Jest suite (via a temp CJS config; the committed `jest.config.ts` fails to parse
  under Node 22 — a **pre-existing, unrelated** environment issue): **91 suites, 1245 tests, all pass.**
- `npx eslint <changed web files>` → 0 errors.
- `npx tsc --noEmit` in `mobile/` and `webnegosyo-app/` → no errors in changed files.

## Known Gaps / Follow-ups
- **Deploy steps (not code):** apply the Supabase migration to the live project, and
  push the Convex bundle to every tenant (Deploy Schema, v13) so the schema/mutation land.
- Convex confirmation screen on the customer app falls back to the UUID slice (the mutation
  returns only the id); the live order-status screen shows the real number. Acceptable.
- `jest.config.ts` ESM parse failure under Node 22 predates this work; not addressed here.
