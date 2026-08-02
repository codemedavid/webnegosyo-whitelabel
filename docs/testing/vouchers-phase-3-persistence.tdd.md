# TDD evidence — Vouchers Phase 3a: persistence + row mapping

**Source plan**: inline plan from `/ecc:plan` for the voucher & discount system.
Phase 3 of 8, **first half only** — see "What is not done" below.
**Depends on**: [Phase 1 schema](./vouchers-phase-1-schema.tdd.md), [Phase 2 engine](./vouchers-phase-2-engine.tdd.md).

## User journeys

1. As a merchant on Convex, I want discounted orders to work on my existing
   backend without waiting for a per-tenant redeploy.
2. As a merchant reading an old order, I want its discount breakdown to be
   readable regardless of which backend stored it.
3. As a merchant refunding one item, I want to know that item's share of the
   discount.
4. As a merchant with an unlimited-use voucher, I do not want it silently
   disabled by a null-to-zero coercion.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Backend-neutral persistence (`src/lib/order-discount.ts`) | `Cannot find module '@/lib/order-discount'` | 94/94 across the five voucher suites |
| DB row → domain mapping (`src/lib/vouchers/mapper.ts`) | `Cannot find module '@/lib/vouchers/mapper'` | same run |

Validation: `npx jest --config jest.config.cjs tests/unit/vouchers`
Full suite: `Tests: 4980 passed, 8 skipped, 4988 total`.

## Decisions the tests encode

- **`total` is always already NET of the discount, on every backend.** The
  payload is the breakdown — receipt lines and refund maths — never the source
  of the amount charged. Nothing downstream should subtract it again.
- **Convex tenants carry the payload in `customerData.discount`.** The Convex
  schema is deployed per tenant, so a new column would reach only redeployed
  tenants. Same trick POS payments already use (`webnegosyo-app/lib/pos-order.ts`).
- **The `discount_data` column beats the blob** when an order has both: a tenant
  migrated from Convex to Postgres can carry both, and the column is what
  reporting aggregates.
- **A malformed blob returns null, never throws.** The blob is untyped at the
  database edge; a reader must not assume its shape.
- **pg `numeric` comes back as a string** and is coerced at the mapper. Left
  alone it mostly works by accident and then fails at one comparison.
- **A null usage limit stays null.** Coerced to 0 it would read as "no
  redemptions left" and disable every unlimited voucher in the system.
- **Unrecognised channel values are dropped**, not passed to the engine.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An undiscounted order carries no `discount` key at all | `order-discount.test.ts:returns null when nothing was discounted` | unit | PASS |
| 2 | Writing a discount preserves existing customerData (outlet, POS payment) | `…:nests the payload under 'discount' without disturbing existing customerData` | unit | PASS |
| 3 | Writing never mutates the caller's customerData | `…:does not mutate the customerData it was given` | unit | PASS |
| 4 | Convex, platform Postgres, and snake_case rows all read back | `…:reads a Convex order` / `…:reads a Postgres order` / `…:reads snake_case customer_data` | unit | PASS |
| 5 | The column wins over the blob when both exist | `…:prefers the column over the blob` | unit | PASS |
| 6 | Malformed blobs and nulls return null instead of throwing | `…:returns null rather than throwing on a malformed blob` | unit | PASS |
| 7 | What was written reads back identically | `…:round-trips what writeOrderDiscount produced` | unit | PASS |
| 8 | Delivery discount is stored separately from the line discount | `…:keeps the delivery portion separate` | unit | PASS |
| 9 | pg numeric strings become numbers | `mapper.test.ts:coerces numeric strings` | unit | PASS |
| 10 | A null usage limit stays null | `mapper.test.ts:keeps a null usage limit as null` | unit | PASS |
| 11 | Missing channels default to all three; unknown ones are dropped | `mapper.test.ts` → channels | unit | PASS |
| 12 | Only this voucher's targets, of the right type, are collected | `mapper.test.ts` → targets | unit | PASS |
| 13 | A scoped voucher with no loaded targets gets an empty list, not undefined | `mapper.test.ts:gives a scoped voucher an empty target list` | unit | PASS |

## What is NOT done (rest of Phase 3)

This half is pure logic and ships safely on its own — nothing calls it yet, so
the running product is unchanged. Still outstanding:

1. **`src/types/supabase.ts` has no `vouchers`, `voucher_targets`, or
   `voucher_redemptions` entries**, and `orders`/`order_items` lack the new
   discount columns. Any Supabase query against these tables will not typecheck
   until the generated types are refreshed. This is the first task of the next
   session.
2. **`validateVoucherAction`** (preview for the checkout UI) — loads the voucher
   + targets by code, maps, evaluates, returns priced result or rejection.
3. **Authoritative re-pricing inside `createOrderAction`** — the client-sent
   discount must be ignored and recomputed server-side from the code, mirroring
   how delivery fee and `outletId` are already re-validated there.
4. **Redemption write** via `redeem_voucher()` keyed on `clientOrderId`, plus
   deriving `customer_key` from the existing `customer-identity.ts`
   normalization so per-customer limits work.

## Coverage

All voucher modules remain at 100% statements/lines; the aggregate is pulled
down only by the type-only `types.ts`, which has no runtime code.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED | `30dc420` |
| GREEN | `8aaf887` |
