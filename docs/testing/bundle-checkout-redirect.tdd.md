# TDD Evidence — Bundle-only checkout redirects to menu

## Source

Bug reported by user against production tenant `silogan-sa-isla.webnegosyo.com`:
adding a bundle and pressing "Proceed to Checkout" always bounces back to the
main menu. Journeys derived during this TDD run (no `*.plan.md`).

## User journey

> As a customer, I want to add a bundle to my cart and check out, so that I can
> buy a bundle even when my cart contains no à la carte items.

## Reproduction (production, before fix)

1. Bundles → "Island Silog + Drink Combo" → completed the 3-step wizard → **Add Bundle to Cart** (cart badge = 2).
2. Cart drawer → **Proceed to Checkout** → "Before you go…" upsell → **Continue to Checkout**.
3. URL became `/silogan-sa-isla/checkout` ("Loading checkout…"), then immediately redirected to `/silogan-sa-isla/menu`. Bug confirmed.

## Root cause

`src/hooks/useCheckout.ts` empty-cart redirect only inspected `items.length === 0`
and ignored `bundleItems`. A bundle-only cart has an empty `items` array, so the
guard fired and pushed the customer to `/menu`. Every other cart consumer
(cart templates, `getFullCartItemCount`, `calculateFullCartTotal`) counts both
arrays; only this guard was asymmetric.

## Fix

- Added pure predicate `isCheckoutCartEmpty(items, bundleItems)` in
  `src/lib/cart-utils.ts`, delegating to the existing `getFullCartItemCount`
  (DRY — bundles are already counted correctly there).
- Rewired the `useCheckout` redirect guard to use it, and added `bundleItems` to
  the effect deps.

## Task report

| Step | Command | Result |
|------|---------|--------|
| RED  | `jest --testPathPatterns=checkout-cart-empty-guard` | FAIL — `isCheckoutCartEmpty is not a function` (4/4) |
| GREEN | same | PASS 4/4 after adding the predicate |
| Regression | `jest --testPathPatterns="cart|checkout"` | PASS 116/116 across 10 suites |
| Types | `tsc --noEmit` | no errors in changed files |
| Lint | `eslint useCheckout.ts cart-utils.ts checkout-cart-empty-guard.test.ts` | clean |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Empty cart (no items, no bundles) → empty | `checkout-cart-empty-guard.test.ts` | unit | PASS |
| 2 | Regular item present → not empty | same | unit | PASS |
| 3 | **Bundle-only cart → not empty (regression)** | same | unit | PASS |
| 4 | Item + bundle → not empty | same | unit | PASS |

## Known gaps

- Live browser re-verification not done: production runs the deployed build, so
  the fix must ship before it can be observed there. The redirect logic itself
  is covered by the unit predicate.
- Separately observed during repro: the "Before you go…" checkout-upsell modal
  showed **Cart total ₱0.00** for a bundle-only cart — a likely second, cosmetic
  bundles-not-counted bug in that component's total. Not in scope for this fix;
  flagged for follow-up.
