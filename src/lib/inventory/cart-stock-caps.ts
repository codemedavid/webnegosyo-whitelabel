/**
 * The cart page's quantity cap, from the same producible ceiling the product
 * page stepper and the checkout guard use (`/api/inventory/ceilings`). Pure.
 *
 * `ceiling` is `null` for a dish with no ceiling — untracked, a branch with no
 * shelf row, never-counted stock — which behaves exactly as before. Checkout
 * (`checkout-stock-guard.ts`) stays the hard refusal either way.
 */

import { describeRemainingStock, resolveAddableQuantity } from '@/lib/inventory/stepper-cap'

/** Any cart line: only the dish id and quantity matter here. */
interface DishLine {
  menu_item: { id: string }
  quantity: number
}

/** No stepper limit of its own beyond stock: the cart's other rules still apply. */
const NO_HARD_MAX = Number.MAX_SAFE_INTEGER

/** Every line of a dish shares one shelf (sizes, add-ons, notes). */
export function countDishInCart(items: readonly DishLine[], menuItemId: string): number {
  return items.reduce((sum, line) => (line.menu_item.id === menuItemId ? sum + line.quantity : sum), 0)
}

export function canAddMoreOfDish(ceiling: number | null, inCart: number): boolean {
  return resolveAddableQuantity(ceiling, inCart, NO_HARD_MAX) > 0
}

/**
 * The line under a cart row, or null. A cart holding MORE than the kitchen
 * can make (stock fell after adding) says how many are left, because checkout
 * will refuse it until it is lowered.
 */
export function describeCartLineStock(ceiling: number | null, inCart: number): string | null {
  if (ceiling !== null && ceiling > 0 && inCart > ceiling) {
    const left = Math.floor(ceiling)
    return `Only ${left} left — lower to ${left} to check out`
  }
  return describeRemainingStock(ceiling, inCart)
}
