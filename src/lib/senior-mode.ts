/**
 * Senior-friendly ordering mode — pure rules.
 *
 * A per-tenant toggle (`tenants.senior_friendly_mode`, set in the Branding
 * Studio → Storefront → Easy ordering) for stores whose customers are older.
 * It answers the three things those customers got stuck on:
 *
 *   1. "Where is the cart / the back button?" — a large labelled cart bar is
 *      pinned to the bottom of the menu, the header cart gains a text label,
 *      and back buttons say where they go.
 *   2. "Did it go into my cart?" — adding a dish shows a large worded
 *      confirmation, and the bottom cart bar flashes "Added!".
 *   3. "Am I at the cart, at checkout, or did I already order?" — the cart,
 *      checkout and confirmation pages show a numbered step tracker.
 *
 * Everything is additive: with the toggle off nothing renders and nothing
 * changes size, so stores that never touch it see no difference.
 */

export const SENIOR_MODE_COLUMN = 'senior_friendly_mode' as const

/**
 * Root font scale while the mode is on. Tailwind sizes text, spacing and
 * tap targets in rem, so one root change enlarges the whole storefront evenly
 * (like browser zoom) without touching any of the ~20 card/cart/checkout
 * designs. 112.5% = 18px body text: clearly larger, and still leaves two
 * cards per row on a 360px phone.
 */
export const SENIOR_MODE_ROOT_FONT_SCALE = '112.5%'

/** Route segments (right after the optional tenant slug) the mode never styles. */
const MERCHANT_SEGMENTS: ReadonlySet<string> = new Set(['admin', 'login', 'superadmin'])

/**
 * Whether `pathname` is a customer-facing storefront route.
 *
 * The tenant layout also wraps the merchant's /admin and /login pages; those
 * must never be enlarged by a customer setting. Subdomain and custom-domain
 * visitors see `/admin`, path-based ones `/{slug}/admin`, so only the first
 * two segments are checked — a dish id such as `admin-special` deeper in the
 * path is still a customer page.
 */
export function isSeniorModeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return true
  const [first, second] = pathname.split('/').filter(Boolean)
  return !MERCHANT_SEGMENTS.has(first ?? '') && !MERCHANT_SEGMENTS.has(second ?? '')
}

/**
 * The effective setting: the Branding Studio's unsaved draft (inside the
 * preview iframe) wins over the saved column, but only when it actually
 * carries a boolean for this field.
 */
export function resolveSeniorModeEnabled(
  saved: boolean | null | undefined,
  draft: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  const drafted = draft?.[SENIOR_MODE_COLUMN]
  if (typeof drafted === 'boolean') return drafted
  return saved === true
}

export type SeniorOrderStepId = 'menu' | 'cart' | 'checkout' | 'done'
export type SeniorOrderStepStatus = 'done' | 'current' | 'upcoming'

export interface SeniorOrderStep {
  id: SeniorOrderStepId
  number: number
  label: string
  status: SeniorOrderStepStatus
}

const ORDER_STEPS: ReadonlyArray<{ id: SeniorOrderStepId; label: string }> = [
  { id: 'menu', label: 'Choose food' },
  { id: 'cart', label: 'Check cart' },
  { id: 'checkout', label: 'Your details' },
  { id: 'done', label: 'Order sent' },
]

/** The four ordering steps, each marked relative to where the customer is now. */
export function resolveSeniorOrderSteps(current: SeniorOrderStepId): SeniorOrderStep[] {
  const currentIndex = ORDER_STEPS.findIndex((step) => step.id === current)
  return ORDER_STEPS.map((step, index) => ({
    ...step,
    number: index + 1,
    status: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }))
}

/** "1 item" / "3 items" — or a plain sentence when there is nothing to count. */
export function describeCartCount(count: number): string {
  if (count <= 0) return 'Your cart is empty'
  return count === 1 ? '1 item' : `${count} items`
}

export interface AddedToCartMessage {
  title: string
  description: string
}

/**
 * The add-to-cart confirmation, in words: a plain title and what went in.
 * Kept to two short lines — the "what next" is the bottom "View cart" bar,
 * which flashes "Added!" at the same moment.
 */
export function describeAddedToCart(
  itemName: string,
  quantity: number,
  presellDateLabel?: string,
): AddedToCartMessage {
  const what = quantity > 1 ? `${quantity} × ${itemName}` : itemName
  const when = presellDateLabel ? ` for ${presellDateLabel}` : ''
  return {
    title: 'Added to your cart',
    description: `${what}${when}`,
  }
}
