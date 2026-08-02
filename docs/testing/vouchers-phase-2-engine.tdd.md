# TDD evidence — Vouchers Phase 2: the pure discount engine

**Source plan**: inline plan from `/ecc:plan` for the voucher & discount system. Phase 2 of 8.
**Depends on**: [Phase 0](./vouchers-phase-0-order-totals.tdd.md) (`computeOrderTotals`).

## User journeys

1. As a merchant, I want a voucher that applies to my whole menu, to specific
   products, or to specific categories.
2. As a merchant, I want to say whether a voucher may be combined with another,
   and to cap how many times it can be claimed.
3. As a customer, I want a rejected code to tell me *why* — expired, ₱300 short,
   not valid on anything in my cart.
4. As a merchant, I want a voucher worth more than the cart to make the order
   free, never to owe the customer money.
5. As a merchant refunding one item weeks later, I want to know how much of the
   discount belonged to that item.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Eligibility gate (`eligibility.ts`) | `Cannot find module '@/lib/vouchers/eligibility'` | 29/29 |
| Discount valuation + allocation (`discount.ts`) | `Cannot find module '@/lib/vouchers/discount'` | 21/21 |
| Stacking resolution (`stacking.ts`) | `Cannot find module '@/lib/vouchers/stacking'` | 67/67 across all three suites |

Validation command: `npx jest --config jest.config.cjs tests/unit/vouchers`

## Decisions the tests encode

- **Stacking is sequential, not parallel.** Two 50% vouchers on a ₱200 cart take
  ₱150 off, not ₱200. Valuing both against the original price is how a merchant
  gives an order away by accident.
- **First entered wins a solo conflict.** Never reordered to whichever is worth
  more — a customer quietly given a different discount than the one they typed
  has no way to understand what happened.
- **An empty target list matches nothing.** Reading a misconfigured scoped
  voucher as "everything" would turn a typo into a store-wide giveaway.
- **Minimum spend measures the whole cart**, not just the eligible items: a
  ₱500-minimum drinks voucher accepts a ₱600 cart holding ₱200 of drinks,
  because the customer did spend ₱600.
- **The end instant is still valid.** A voucher ending "today 23:59:59" works at
  23:59:59.
- **Per-customer limits are not enforced for guests**, who cannot be attributed;
  the total limit still applies.
- **The last line absorbs the rounding remainder**, so allocations always sum
  back to the discount. A lost centavo is a refund that never balances.

## Test specification (abridged — 67 assertions total)

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Expired / not-yet-started / deactivated vouchers are refused | `eligibility.test.ts` → validity window | unit | PASS |
| 2 | A fully claimed voucher is refused; a null limit is unlimited | `eligibility.test.ts` → usage limits | unit | PASS |
| 3 | Below-minimum rejection reports an actionable shortfall | `eligibility.test.ts:reports the shortfall` | unit | PASS |
| 4 | Product/category scope matches only in-scope lines | `eligibility.test.ts` → scope | unit | PASS |
| 5 | Free delivery ignores item scope but requires a delivery fee | `eligibility.test.ts:exempts free-delivery vouchers from item scope` | unit | PASS |
| 6 | Channel and branch restrictions are enforced; single-location stores are exempt from branch rules | `eligibility.test.ts` → channel and branch | unit | PASS |
| 7 | Percent honours its cap; fixed never exceeds the eligible lines | `discount.test.ts` → percent / fixed | unit | PASS |
| 8 | A >100% or negative discount value cannot produce a surcharge or exceed the cart | `discount.test.ts` → zero-value outcomes | unit | PASS |
| 9 | Allocations sum exactly to the discount even on a 3-way uneven split | `discount.test.ts:allocations always sum to exactly the discount` | unit | PASS |
| 10 | A stacked voucher discounts the remainder, not the original price | `discount.test.ts` / `stacking.test.ts` → sequencing | unit | PASS |
| 11 | Solo-only is enforced in both directions with a stated reason | `stacking.test.ts` → stackable vs solo only | unit | PASS |
| 12 | Engine output feeds `computeOrderTotals` and produces the right grand total | `stacking.test.ts:emits discount lines that computeOrderTotals consumes directly` | integration (module) | PASS |
| 13 | Identical input yields identical output, so two devices agree | `stacking.test.ts:produces the same result for the same input` | unit | PASS |
| 14 | Neither the vouchers nor the cart handed in are mutated | `stacking.test.ts:does not mutate the vouchers or the context` | unit | PASS |

## Coverage

```
npx jest --config jest.config.cjs tests/unit/vouchers --coverage --collectCoverageFrom='src/lib/vouchers/**'

File            | % Stmts | % Branch | % Funcs | % Lines
 discount.ts    |     100 |    84.84 |     100 |     100
 eligibility.ts |     100 |    97.95 |     100 |     100
 stacking.ts    |     100 |       95 |     100 |     100
 types.ts       |       0 |        0 |       0 |       0
All files       |   80.53 |    92.23 |    92.3 |   80.53
```

All three implementation modules are at 100% statements and lines. `types.ts`
holds no runtime code — v8 reports 0% for a type-only file, which is what pulls
the aggregate to 80.53%. Above the 80% threshold either way.

## Known gaps / follow-ups

- **The port to the merchant app and desktop register is deferred to Phase 6**,
  where the register actually consumes it. Copying it now, with no caller and no
  parity test to keep it honest, would be three copies drifting from day one.
- Eligibility takes `usedCount` as data. It is advisory at preview time — the
  authoritative check is the conditional UPDATE inside `redeem_voucher()`
  (Phase 1 migration), which is what makes the limit race-safe.
- Manual (non-voucher) cashier discounts reuse `OrderDiscountLine` but skip this
  engine entirely; they arrive in Phase 6.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED eligibility | `19950d2` |
| GREEN eligibility | `c7921c7` |
| RED discount | `b6213cc` |
| GREEN discount | `a1739ee` |
| RED stacking | `0f924cd` |
| GREEN stacking | `b987893` |
| Phase 1 schema (written, not applied) | `562825c` |
