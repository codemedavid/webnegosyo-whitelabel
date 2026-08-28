/**
 * What a quantity stepper may reach, and what it says while it gets there.
 *
 * `checkout-stock-guard.ts` is the authoritative boundary — it refuses a cart
 * the kitchen cannot fill, on every order backend. But checkout is a bad place
 * to *learn*: a customer picks twelve, walks through address, payment and proof
 * upload, and is turned away on the last screen. This is the same ceiling,
 * surfaced where the number is actually chosen.
 *
 * Pure, so the product page, the cart page and the register agree. A stepper
 * that stops at 5 while the guard refuses at 4 would be worse than no cap at
 * all: it teaches the customer the number is trustworthy right before it isn't.
 */

/**
 * Below this many remaining, the stepper says so. Above it, it stays quiet —
 * "only 40 left" is not scarcity, it is noise, and a storefront that cries
 * shortage on every dish trains customers to ignore it on the one that matters.
 */
export const STOCK_HINT_THRESHOLD = 10

/**
 * How many MORE of a dish may be added.
 *
 * `ceiling` is `null` for a dish with no recipe — untracked means unlimited, so
 * such a dish must behave exactly as it did before any of this existed.
 * `alreadyInCart` is what the cart holds of that same dish, because a ceiling
 * of five with two already chosen leaves three, not five.
 */
export function resolveAddableQuantity(
  ceiling: number | null,
  alreadyInCart: number,
  hardMax: number,
): number {
  if (ceiling === null) return hardMax

  // Stock can fall between adding to the cart and looking at it again, so the
  // remainder can legitimately be negative. It is never an invitation.
  const remaining = Math.max(0, ceiling - alreadyInCart)
  return Math.min(remaining, hardMax)
}

/**
 * The line of copy under a stepper, or `null` when there is nothing worth
 * saying.
 *
 * Zero is never spelled "0 left": a count reads as a quantity to try, and this
 * one is not. Which of the two zero messages applies matters — "sold out" is
 * about the shop, "you have them all" is about the customer's own cart, and
 * telling someone a dish is sold out while five of it sit in their cart is the
 * kind of contradiction that costs the whole order.
 */
export function describeRemainingStock(
  ceiling: number | null,
  alreadyInCart: number,
): string | null {
  if (ceiling === null) return null
  if (ceiling <= 0) return 'Sold out'

  const remaining = Math.max(0, ceiling - alreadyInCart)
  if (remaining <= 0) return 'That’s all we can make today'
  if (remaining > STOCK_HINT_THRESHOLD) return null

  return `Only ${remaining} left`
}
