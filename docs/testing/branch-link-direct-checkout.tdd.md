# Branch link → checkout, without the questions

**Source plan:** none. Journeys were derived during this TDD run from a live
reproduction against `www.webnegosyo.com/gungjeon-unlimited`.

## The report

> "Why does `/b/branch` still need to select an outlet when checking out? We
> want to proceed to checkout directly on the right branch. So we want to skip
> both."

## What the reproduction actually showed

Playwright, production, fresh browser profile, iPhone 13 and desktop:

| Link | Checkout showed |
|---|---|
| `/gungjeon-unlimited/b/valenzuela` | **"Select Your Outlet"** — five branches to pick from |
| `/gungjeon-unlimited/b/gungjeon-valenzuela` | **"Ordering from Gungjeon Unlimited Valenzuela · Change"** |

The branch is `gungjeon-valenzuela`. `valenzuela` matched no slug, so
`resolveOutletSelection` returned `unknown-link`, nothing was written to
`linked_outlet_<tenant>`, and `useCheckoutOutlet` had nothing to start from.
Under the `after` timing there is no splash screen to carry the `unknown-link`
explanation, so the failure was completely silent — the customer just got asked,
and the merchant had no way to learn their printed link was wrong.

The second question — "How would you like to receive your order?" — was already
answered: `useCheckout` selects a sole order type on load. It rendered as a step
made of an answer.

## User journeys

1. As a merchant, I want to paint `/b/valenzuela` on my branch signage and have
   it reach my Valenzuela branch, so the link I can actually fit on a poster
   works.
2. As a customer scanning a branch QR, I want checkout to already know which
   branch I am standing in, so I go straight to the form.
3. As a customer at a dine-in-only restaurant, I do not want to be asked how I
   would like to receive my order when there is one answer.
4. As an operator, I would rather be asked a visible question than have an order
   attributed to a branch the customer was never standing in.

## Task report

### 1. A link may name part of a slug

`matchOutletByLinkSlug` matches an exact slug first, then a whole dash-separated
segment, and returns `null` unless exactly one active branch matches. Wired into
`resolveOutletSelection` (storefront) and `useCheckoutOutlet` (checkout) so both
resolve a link the same way.

- RED: `npx jest tests/unit/outlets-link-slug-match.test.ts` → *Cannot find
  module '@/lib/outlets/link-slug-match'*; the journey test failed at
  `expect(result.current.outlet?.id).toBe('o-cainta-main')`.
- GREEN: 531 tests across the outlet and checkout suites pass.

Verified against the real branch slugs:

| Link | Resolves to |
|---|---|
| `valenzuela` | `gungjeon-valenzuela` |
| `cafe` / `lower` / `juancibo` | `gungjeon-cafe` / `gungjeon-lower` / `gungjeon-juancibo` |
| `cignal` / `central` | `central-cignal` |
| `gungjeon` | **null** — four branches share the token, so it still asks |
| `valenzuel` (typo) | **null** — a fragment is not a segment |

### 2. Do not ask a question with one answer

`shouldAskFulfillmentMethod` returns true only when there is more than one order
type, or when the sole one takes advance orders — that section also hosts the
ASAP-or-schedule choice, and hiding it there would remove the only way to place
a pre-order. All five checkout designs gate the section on it.

The wizard could not simply hide the contents: it gives each question a screen,
so hiding would leave a titled, empty screen with a Continue button.
`resolveWizardSteps` drops the screen from the walk instead, and every per-step
lookup in `wizard-checkout.tsx` is now keyed by step NAME rather than index, so
a dropped screen cannot leave the index pointing at the wrong one.

- RED: `npx jest tests/unit/checkout-wizard-steps.test.ts` → *Cannot find module
  '@/lib/checkout-wizard-steps'*.
- GREEN: both suites pass.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | An exact branch slug resolves | `outlets-link-slug-match.test.ts:matches an exact slug` | unit | PASS |
| 2 | `/b/valenzuela` reaches `gungjeon-valenzuela` | `outlets-link-slug-match.test.ts:matches the distinctive tail of a slug` | unit | PASS |
| 3 | A branch named `cafe` owns `/b/cafe` over `gungjeon-cafe` | `outlets-link-slug-match.test.ts:prefers an exact match over a partial one` | unit | PASS |
| 4 | Two possible branches resolve to NEITHER | `outlets-link-slug-match.test.ts:refuses to guess when two branches could be meant` | unit | PASS |
| 5 | A fragment (`valen`) resolves to nothing | `outlets-link-slug-match.test.ts:does not match a fragment that is not a whole segment` | unit | PASS |
| 6 | The storefront remembers the branch a short link named | `outlets-deep-link-persistence.test.tsx:resolves a link that names only the distinctive part of the slug` | integration | PASS |
| 7 | Checkout starts from the linked branch and does not ask | `outlets-deep-link-persistence.test.tsx:pre-selects the linked branch instead of asking again` | integration | PASS |
| 8 | A deactivated linked branch still asks | `outlets-deep-link-persistence.test.tsx:still asks when the linked branch is no longer on offer` | integration | PASS |
| 9 | One order type and no scheduling asks nothing | `checkout-fulfillment-choice.test.ts:does not ask when there is exactly one and nothing to schedule` | unit | PASS |
| 10 | A sole order type with advance orders still asks | `checkout-fulfillment-choice.test.ts:still asks when the sole order type takes advance orders` | unit | PASS |
| 11 | The wizard drops the receive screen rather than emptying it | `checkout-wizard-steps.test.ts:drops the receive screen when there is nothing to receive-choose` | unit | PASS |

## Coverage and known gaps

- `npx jest tests/unit` → **5410 passed, 1 failed, 437 suites**. The single
  failure is `tests/unit/vouchers/engine-parity.test.ts`, which is pre-existing
  in this working tree and untouched by this change — no voucher file appears in
  its diff. It comes from concurrent `webnegosyo-app` voucher work.
- `npx tsc --noEmit` → no errors under `src/`.
- `npx next lint` on every changed file → no warnings or errors.
- **Not verified end to end in production.** The Playwright runs above proved the
  BEFORE behaviour; the AFTER behaviour is proven by unit and hook-level tests
  only. Re-run `/b/valenzuela` against the deployed build to confirm.
- **The `before` timing is still untouched.** On a tenant whose
  `outlet_selection_timing` is `before` (the default), a branch link still leaves
  no mode-bearing selection, so leaving the `?outlet=` URL brings the splash back
  and the order carries no branch. Only `gungjeon-unlimited` runs multi-branch
  today and it is on `after`, so nothing live is affected — but a merchant
  switched to `before` would still hit the original complaint.

## Merge evidence

- RED: `35e2b90` — reproducers added; both new modules missing, storefront
  journey resolving `?outlet=cainta` to no branch.
- GREEN: `01f8f44` — 531 tests across the outlet and checkout suites pass.
