# TDD evidence — Vouchers Phase 6c: the redemption burn

**Source plan**: inline plan from `/ecc:plan`, Phase 6c.
**Depends on**: [Phase 6b](./vouchers-phase-6b-pos-entry.tdd.md).

Phase 6b shipped register-side voucher pricing and recorded one gap in its own
Known gaps section as "the single most important remaining piece":

> **Nothing burns a POS redemption.** … a usage-limited voucher can currently
> be reused at a counter.

This phase closes that, and answers a second question that had been open since
Phase 3b.

## User journeys

1. As an owner, I want a voucher limited to 50 uses to actually stop at 50,
   whether it was used online or at the counter.
2. As a cashier, I want a code a customer presents to be worth the same at the
   till as it is on the website.
3. As an owner, I want to know which staff member burned a redemption.
4. As a cashier, I never want a voucher problem to stop me closing a sale the
   customer has already paid for.

## Why a route and not a direct call

The register cannot burn a redemption itself. `redeem_voucher()` is
SECURITY DEFINER and executable by `service_role` only — deliberately, after
the Phase 1 security review found PostgREST had published it to anon and
anyone could exhaust a merchant's vouchers. The phone holds an anon key.

The house pattern for a privileged write from the merchant app is a Next.js
route authenticated by the caller's own Supabase access token:
`/api/inventory/order-stock`, `/api/inventory/movement` and
`/api/inventory/transfers` all work this way, and the register already calls
the first after every tender.

`order-stock` is also the right posture to copy. Its header explains that it is
best-effort because it "runs behind a sale already rung up and paid for, where
a stock failure must not fail the tender" — precisely the shape of a voucher
burn, and consistent with the Phase 3 decision in `order-voucher-flow.ts` that
a failed burn is logged, not thrown.

**But the split matters**: the ROUTE reports faithfully, the CALLER is
best-effort. `redeemVoucher` already returns `redeemed: false` rather than
throwing, precisely so a caller cannot mistake an exhausted voucher for a
successful burn. Swallowing that server-side would tell a merchant their usage
limit is enforced when it is not.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Dead checkout-lead status history | 1 failed (offender: `checkout-leads-service.ts`) | 2 passed |
| Redeem route | 10 failed (`Cannot find module .../redeem/route`) | 10 passed |
| Register's server calls | compile-time: `Cannot find module './voucher-service'` | 10 passed |
| Lookup route | 8 failed | 8 passed |

Merchant app: **1789 passed, 105 suites**, `tsc --noEmit` clean.
Web voucher + totals + checkout-leads suites: **258 passed, 23 suites**.

Five web suites fail (`inventory-live-e2e`, `cache`, `leads-analytics`,
`leads-service`, `order-token`). These were verified as **pre-existing** by
running them at the base commit `e1ffd9d` in a scratch worktree, where they
fail identically. None are files this phase touched.

## Decisions the tests encode

- **`redeemedBy` comes from the verified token, never the request body.** The
  register prices locally, so the audit trail is the entire defence against a
  forced discount; a cashier able to name someone else could take money off and
  pin it on a colleague. This also closes 6b's fourth known gap.
- **A bad redemption fails the whole request rather than being dropped.**
  Unlike a stock line — where one unresolvable entry must not stop the rest of
  an order moving — a silently dropped redemption is a discount given away for
  free with nothing recording it.
- **The lookup is NOT gated on the `vouchers` permission.** That permission
  governs inventing a *manual* discount, a till-skimming vector. Honouring a
  code the merchant is advertising is ordinary counter work, and requiring a
  supervisor would mean fetching one every time a customer produced a coupon.
- **The lookup fails closed.** No session, a refusal, or no signal all yield
  `[]`, so an unverifiable code is worth zero rather than assumed valid.
- **Authorization and the query use the same `tenantId` value.** The lookup
  runs under the service-role client, which bypasses RLS by design, so this is
  the only thing stopping one merchant reading another's codes.
- **Burns are sequential, not concurrent.** Each is a conditional UPDATE on a
  voucher row and two of an order's codes could be the same voucher.
- **The burn is keyed on the order id**, so the unique `(voucher_id, order_id)`
  index makes a retry a no-op instead of a second burn — which is what makes
  fire-and-forget safe on the client.
- **A manual discount burns nothing**, having no voucher behind it.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Only an admin of the tenant may burn a redemption | `vouchers-redeem.test.ts` (401/403 cases) | integration | PASS ×4 |
| 2 | Every presented redemption is burned | `…:burns each presented redemption` | integration | PASS |
| 3 | The burn is credited to the authenticated user, not the body | `…:credits the burn to the authenticated user` | integration | PASS |
| 4 | An exhausted voucher is reported, not reported as success | `…:reports a burn that did not happen` | integration | PASS |
| 5 | A malformed redemption is refused outright | `…:skips a redemption whose amount is not positive` | integration | PASS |
| 6 | Only an admin of the tenant may read its codes | `vouchers-lookup.test.ts:rejects an admin of a different tenant` | integration | PASS |
| 7 | A plain cashier can still honour a customer's code | `…:serves a plain cashier without the vouchers permission` | integration | PASS |
| 8 | The register posts voucher lines with its session token | `voucher-service.test.ts:posts each voucher line` | unit | PASS |
| 9 | A manual discount never reaches the burn | `…:ignores a manual discount` | unit | PASS |
| 10 | A failed burn never fails the tender | `…:never throws when the network fails` | unit | PASS |
| 11 | An unverifiable code is worth zero | `…:returns nothing when the lookup fails` | unit | PASS ×3 |
| 12 | No code queries a table absent from the schema | `checkout-leads-schema-wiring.test.ts` | unit | PASS ×2 |

## The checkout-lead status history decision

This was the second open question, unanswered since Phase 3b. Resolved by
evidence rather than preference:

- `checkout_lead_status_history` is declared in migration
  `20260405000001_checkout_leads.sql` but **`to_regclass` returns null** — that
  part was never applied.
- `checkout_leads` itself holds **69 real rows**, newest **2026-08-01**.
- **All 69 sit at `initiated`; exactly one was ever touched.**

So the write always failed into a `console.error` and the read always returned
`[]`, making the panel render "No status changes yet" unconditionally — a
stronger claim than the truth, which was that nothing *could* be recorded. An
audit trail of status changes that never happen records nothing, so it was
removed rather than completed.

The status note went with it: `checkout_leads.notes` holds the **customer's
own** signup notes, so there was nowhere to put a superadmin note without
destroying customer data.

Worth separating from the code decision: **69 people started paying for the
platform and none have been followed up.** That is a business finding, not a
schema one.

## Known gaps

- **The burn is not yet reachable from the register.** `pos-tender.tsx` has no
  discount plumbing at all — `buildPosOrder` accepts `discounts` but the tender
  screen never passes any, because the POS discount UI does not exist yet.
  Everything below the UI is built and tested; Phase 6d connects it. This is
  stated plainly because the phase's own purpose was closing a gap of exactly
  this kind.
- **No register UI.** Unchanged from 6b: no code field, no discount button.
- **`pos-tender.tsx` cannot be unit-tested.** The app's jest `roots` are `lib/`
  and `theme/` only, so screen-level wiring is covered by neither codebase —
  the same is already true of `notifyPosStockDepletion`.
- **No end-to-end test** of enter-code → order → redemption-burned. The pieces
  are proven individually and at their seams, not as a chain against a live
  database.
- **Offline sales still cannot burn.** A voucher accepted with no signal is
  honoured locally and the burn is lost, so a usage limit can be exceeded by
  the number of sales rung while disconnected. Accepted deliberately: refusing
  a customer's coupon because the wifi dropped is worse than a rare
  over-redemption, and the limit is a merchant's budget rather than a security
  boundary.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — code queries a missing table | `bf31508` |
| GREEN — status history removed | `e2d0179` |
| RED — nothing burns a POS redemption | `9e01f04` |
| GREEN — server-mediated redeem route | `3e8a791` |
| RED — register cannot reach the voucher server | `6017af1` |
| GREEN — register lookup + burn service | `370d983` |
| RED — no way to resolve a code | `cad6103` |
| GREEN — authenticated lookup route | `b0c5dd0` |
