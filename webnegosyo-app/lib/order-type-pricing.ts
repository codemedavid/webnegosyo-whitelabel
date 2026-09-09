/**
 * PORTED from `src/lib/order-types/order-type-pricing.ts` — keep the two in
 * sync, the same arrangement `outlet-menu-overrides.ts` uses here. Only this
 * header may differ between the two files.
 *
 * What the register charges for a dish on a given order type.
 *
 * Grab and foodpanda take a commission, so a merchant prices those channels
 * above a walk-in. Each order type may carry `pos_markup_percent`; each item
 * may carry an exact price for that type in `order_type_item_prices`. Both are
 * override-only: no markup, no row, no order type at all must resolve to the
 * store price unchanged — that is what every tenant has today.
 *
 * Resolution: an exact override replaces the BASE price only. Modifiers
 * always take the markup (there is no per-modifier override), so a ₱150 Grab
 * meal with a ₱10 add-on charges ₱150 + ₱12 at 20%, never ₱150 + ₱10.
 *
 * Rounding: `round2(amount * (1 + pct / 100))` per component; the cart's
 * existing `unitPrice` then sums the rounded parts. Nothing here queries,
 * throws, or mutates its input.
 */

export const MARKUP_PERCENT_MIN = -100
export const MARKUP_PERCENT_MAX = 500

/** The columns this module reads from `order_type_item_prices`. */
export interface OrderTypeItemPriceRow {
  order_type_id: string
  menu_item_id: string
  /** `numeric(10,2)` — arrives as a string from PostgREST unless coerced. */
  price: number | string | null
}

/** orderTypeId → menuItemId → exact price. */
export type OrderTypePriceIndex = Readonly<
  Record<string, Readonly<Record<string, number>>>
>

/** Everything needed to price a line for one order type. */
export interface OrderTypePricing {
  orderTypeId: string
  markupPercent: number | null
  itemPrices: Readonly<Record<string, number>>
}

/** The order-type fields `pricingForOrderType` reads. */
export interface OrderTypePricingSource {
  id: string
  markupPercent?: number | null
}

export function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function isValidMarkupPercent(value: unknown): value is number | null {
  if (value === null) return true
  if (typeof value !== 'number' || Number.isNaN(value)) return false
  return value >= MARKUP_PERCENT_MIN && value <= MARKUP_PERCENT_MAX
}

function toFiniteNumber(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Group rows by order type then item. Last duplicate wins; bad prices skip. */
export function buildOrderTypePriceIndex(
  rows: readonly OrderTypeItemPriceRow[]
): OrderTypePriceIndex {
  return rows.reduce<Record<string, Record<string, number>>>((index, row) => {
    const price = toFiniteNumber(row.price)
    if (price === null) return index
    return {
      ...index,
      [row.order_type_id]: {
        ...(index[row.order_type_id] ?? {}),
        [row.menu_item_id]: price,
      },
    }
  }, {})
}

/**
 * The pricing for one order type, or null when there is none selected. A
 * type absent from the index still carries its markup with an empty map.
 */
export function pricingForOrderType(
  orderType: OrderTypePricingSource | null | undefined,
  index: OrderTypePriceIndex
): OrderTypePricing | null {
  if (!orderType) return null
  return {
    orderTypeId: orderType.id,
    markupPercent: orderType.markupPercent ?? null,
    itemPrices: index[orderType.id] ?? {},
  }
}

function clampMarkupPercent(percent: number): number {
  return Math.min(MARKUP_PERCENT_MAX, Math.max(MARKUP_PERCENT_MIN, percent))
}

/**
 * `amount` marked up by `percent`. Null, zero or NaN percent leaves the
 * amount untouched; an out-of-range percent is clamped, never refused, so a
 * bad admin value cannot zero a menu.
 */
export function applyMarkup(
  amount: number,
  percent: number | null | undefined
): number {
  if (percent === null || percent === undefined || Number.isNaN(percent)) {
    return amount
  }
  if (percent === 0 || Number.isNaN(amount)) return amount
  const marked = round2(amount * (1 + clampMarkupPercent(percent) / 100))
  return Math.max(0, marked)
}

/** The base price of an item: exact override if set, else marked-up list. */
export function resolveItemPrice(
  menuItemId: string,
  listPrice: number,
  pricing: OrderTypePricing | null | undefined
): number {
  if (!pricing) return listPrice
  const override = pricing.itemPrices[menuItemId]
  if (override !== undefined) return override
  return applyMarkup(listPrice, pricing.markupPercent)
}

/** A modifier's price adjustment: always the markup, never an override. */
export function resolveModifierPrice(
  listModifier: number,
  pricing: OrderTypePricing | null | undefined
): number {
  if (!pricing) return listModifier
  return applyMarkup(listModifier, pricing.markupPercent)
}
