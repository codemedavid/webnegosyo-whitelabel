/**
 * Voucher and discount types — the shared vocabulary for the whole feature.
 *
 * Deliberately free of Supabase, Convex, and React types so this module can be
 * ported verbatim into the merchant app and the desktop register, the way
 * `staff-permissions.ts` already is. The DB row shape is camel-cased at the
 * boundary; nothing below this line knows what a database is.
 */

/** How the money comes off. */
export type VoucherDiscountType = 'percent' | 'fixed' | 'free_delivery'

/** What the voucher is allowed to touch. */
export type VoucherScope = 'universal' | 'products' | 'categories'

/** Where the code may be presented. */
export type VoucherChannel = 'checkout' | 'pos' | 'admin'

export interface Voucher {
  id: string
  /** Case-insensitive in practice; stored and compared upper-cased. */
  code: string
  name: string
  description?: string | null
  discountType: VoucherDiscountType
  /** Percent (0–100) for `percent`, pesos for `fixed`, ignored for `free_delivery`. */
  discountValue: number
  /** Ceiling on a percent voucher, so "50% off" cannot cost the merchant ₱5,000. */
  maxDiscountAmount?: number | null
  minOrderAmount?: number | null
  scope: VoucherScope
  /** Menu item ids or category ids, per `scope`. Empty means nothing matches. */
  targetIds?: readonly string[]
  /** False = solo only: this voucher refuses to share an order with any other. */
  isStackable: boolean
  usageLimitTotal?: number | null
  usageLimitPerCustomer?: number | null
  /** Redemptions so far. Authoritative count lives in the DB, not here. */
  usedCount: number
  startsAt?: string | null
  endsAt?: string | null
  channels: readonly VoucherChannel[]
  /** Null/absent = valid at every branch. */
  outletIds?: readonly string[] | null
  isActive: boolean
}

/** One cart line, reduced to just what discounting needs to know. */
export interface DiscountLine {
  /** Stable per-line id — the cart item id, or the order item id when editing. */
  id: string
  menuItemId: string
  categoryId?: string | null
  quantity: number
  /** Line total including variations and add-ons, before any discount. */
  subtotal: number
}

export interface DiscountContext {
  lines: readonly DiscountLine[]
  deliveryFee: number
  serviceCharge: number
  channel: VoucherChannel
  /** Injected so the same cart evaluates identically on every surface. */
  now: Date
  /** Null/absent for single-location stores. */
  outletId?: string | null
  /** How many times THIS customer has already redeemed. Undefined = unknown (guest). */
  customerUsageCount?: number
}

/** Why a voucher was turned down. Drives both the message and any analytics. */
export type VoucherRejectionReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'usage_limit_reached'
  | 'customer_limit_reached'
  | 'below_minimum'
  | 'no_matching_items'
  | 'no_delivery_fee'
  | 'wrong_channel'
  | 'wrong_branch'
  | 'not_stackable'
  | 'no_value'

export interface VoucherEligible {
  isEligible: true
}

export interface VoucherRejected {
  isEligible: false
  reason: VoucherRejectionReason
  /** Customer-facing, already phrased for display. */
  message: string
  /** Only for `below_minimum`: how much more the cart needs. */
  shortfall?: number
}

export type VoucherEligibility = VoucherEligible | VoucherRejected
