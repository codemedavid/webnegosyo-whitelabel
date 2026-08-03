# TDD evidence — Vouchers Phase 3b: server authority

**Source plan**: inline plan from `/ecc:plan` ("remaining tasks"), Phase 3b.
**Depends on**: [Phase 3a persistence](./vouchers-phase-3-persistence.tdd.md).
**Status**: three of five Phase 3b tasks done. See "What is NOT done".

## User journeys

1. As a developer, I want `.from('vouchers')` to typecheck, so the write path
   can be built at all.
2. As a merchant, I want the total in my order-notification email to match what
   the customer was shown.
3. As a customer, I want a mistyped code to tell me it was not recognised
   rather than fail my checkout.
4. As a customer, I want the same code entered twice to discount once.
5. As a customer who has used a one-per-person voucher, I want it turned down.
6. As a merchant, I do not want a visitor to be able to read my vouchers'
   remaining redemptions or targeted products out of the checkout response.
7. As a merchant, I do not want another merchant's code to work on my orders.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Regenerate the database types | jest 7 failed / tsc TS2339 on `vouchers`, `voucher_targets`, `redeem_voucher` | 8 passed; `tsc` back to 0 errors under `src/` |
| Merchant email total via `computeOrderTotals` | guardrail reported `src/app/actions/orders.ts:349` | 11 passed |
| `resolveVouchers` (codes → priced discount) | `Cannot find module '@/lib/vouchers/resolve'` | 11 passed |
| `createVoucherLookup` + `redeemVoucher` | `Cannot find module '@/lib/vouchers/repository'` | 8 passed |
| `buildVoucherPreview` | `Cannot find module '@/lib/vouchers/preview'` | 5 passed |

Validation actually run:

```
npx jest --config jest.config.cjs tests/unit/vouchers
  -> Tests: 126 passed, 126 total (9 suites)
npx jest --config jest.config.cjs
  -> Tests: 4841 passed, 34 failed, 4875 total
./node_modules/.bin/tsc --noEmit
  -> 0 errors under src/; 62 total, all pre-existing, all in test files
npx next lint --file <each changed src file>
  -> No ESLint warnings or errors
```

The 34 failures are pre-existing and identical to `origin/main`
(`cache`, `leads-analytics`, `leads-service`, `order-token`,
`inventory-live-e2e`). They were verified against a clean `origin/main`
worktree in an earlier session and are unrelated to this work.

## The generated types had drifted, and were hiding four defects

`src/types/supabase.ts` had been hand-patched rather than regenerated — its
own annotations had slid onto the wrong tables (a comment naming
`20260806120000_outlet_menu_overrides.sql` sat above `tenant_subscriptions`).
Regenerating from the live schema via the Supabase MCP grew it from 3,535 to
4,811 lines and surfaced:

1. **`checkout_lead_status_history` does not exist in the database.** Confirmed
   against `information_schema.columns`. Its inserts have always failed into a
   swallowed `console.error`, and its reads have always returned `[]` — so the
   superadmin lead-history panel has only ever rendered empty. Behaviour is
   preserved verbatim behind a named seam (`missingStatusHistoryTable`) rather
   than deleted, because the fix is a product decision: add the table, or drop
   the panel. **This is unresolved and needs a decision.**
2. **`checkout_leads.payment_term` is nullable**; the label helper returned the
   raw value, so a null term would have rendered as the string `null`.
3. **`tenants.hero_design` is `text` holding serialized JSON**, not `jsonb`.
4. **`tenants.convex_schema_version` is `text`**, not an integer.

(3) and (4) were type-only lies — Postgres coerced on the way in, so runtime
was always correct. (1) and (2) were real.

## Decisions the tests encode

- **The preview is not authoritative.** It projects to four fields —
  code, name, description, amount. Returning the voucher row would publish
  remaining redemptions, per-customer caps, and targeted product ids to any
  visitor. Enumerating codes is inherent to a coupon field; leaking a voucher's
  internals is not.
- **Tenant scoping lives in the query.** The lookup runs under the service-role
  client, which bypasses RLS by design, so a post-hoc filter would still have
  read another merchant's vouchers off the wire.
- **A failed redemption is returned, never swallowed.** The conditional UPDATE
  inside `redeem_voucher()` is the only thing preventing over-redemption.
- **Optional RPC args are omitted, not blanked.** An empty `p_customer_key`
  would group every guest into a single "customer" and trip per-customer limits
  for people who had never used the code.
- **Entry order survives the round trip.** Codes are normalized and de-duped
  but not reordered, because a solo-only conflict is resolved
  first-entered-wins and reordering silently gives someone a different deal.
- **The per-customer limit is enforced in `resolveVouchers`, not the engine.**
  `DiscountContext` carries one `customerUsageCount` for the whole evaluation
  while the limit is per voucher; pre-filtering holds both without changing the
  engine's tested contract.
- **The guardrail grew a second pattern.** `deliveryFee + serviceCharge` is the
  same offence as `total + deliveryFee` written from the other end, and the
  original shape could not match `orders.ts`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The generated types declare all three voucher tables and the RPC | `database-types.test.ts` | unit | PASS |
| 2 | The mapper's row shapes stay assignable from the real generated rows | `database-types.test.ts` (compile-time) | type | PASS |
| 3 | The merchant email total routes through `computeOrderTotals` | `order-totals-wiring.test.ts` | unit | PASS |
| 4 | An unknown code is a rejection, not a throw | `resolve.test.ts:rejects an unknown code` | unit | PASS |
| 5 | The same code twice discounts once | `resolve.test.ts:does not discount twice` | unit | PASS |
| 6 | Entry order decides a solo-only conflict | `resolve.test.ts:preserves entry order` | unit | PASS |
| 7 | A customer at their limit is turned down; under it, applied | `resolve.test.ts` → customer limit | unit | PASS |
| 8 | No database round trip for zero or blank codes | `resolve.test.ts` → empty | unit | PASS |
| 9 | The voucher query is tenant-scoped | `repository.test.ts:scopes the voucher query` | unit | PASS |
| 10 | Universal-only results skip the targets round trip | `repository.test.ts:does not query targets` | unit | PASS |
| 11 | A failed redemption reports failure | `repository.test.ts:reports failure` | unit | PASS |
| 12 | A guest sends no customer key at all | `repository.test.ts:omits the customer key` | unit | PASS |
| 13 | The preview leaks no counts, limits or targets | `preview.test.ts:never exposes usage counts` | unit | PASS |
| 14 | A rejection carries an actionable message | `preview.test.ts:explains a rejection` | unit | PASS |
| 15 | A missing payment term renders as nothing, not "null" | `checkout-lead-payment-term.test.ts` | unit | PASS |

## Coverage

`src/lib/vouchers/{resolve,repository,preview}.ts` are exercised by 24 new
tests. The voucher modules remain at 100% statements/lines apart from the
type-only `types.ts`, which has no runtime code.

## What is NOT done (rest of Phase 3b)

Nothing in this stage is reachable from the running product yet — no UI calls
any of it, so the shipped behaviour is unchanged apart from the merchant email
total and the payment-term label.

1. **`validateVoucherAction`** — the `'use server'` wrapper around
   `buildVoucherPreview`. Needs tenant resolution and Zod input validation.
   Note the `'use server'` type re-export hazard: `export type { X }` in such a
   file throws at build while `tsc` and Jest stay green.
2. **Authoritative re-pricing inside `createOrderAction`** — accept codes,
   ignore any client-sent amount, recompute, persist via `writeOrderDiscount`,
   then call `redeemVoucher` after the order row exists so the unique
   `(voucher_id, order_id)` index makes a retry a no-op.
3. **`checkout_lead_status_history`** — decide whether to add the table or drop
   the panel.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — types | `1a6da1e` |
| GREEN — types + drift fixes | `a675afd` |
| RED — guardrail on `orders.ts` | `801defe` |
| GREEN — merchant email total | `d7deb87` |
| RED — resolver | `2aa3eb5` |
| GREEN — resolver | `c8061af` |
| RED — repository | `d9fffb1` |
| GREEN — repository | `ab9d67d` |
| RED — preview | `eece902` |
| GREEN — preview | `1f12460` |
