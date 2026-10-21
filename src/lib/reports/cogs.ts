/**
 * Ingredient cost from the stock ledger, to the centavo (profit-model.ts §
 * "Ingredient cost"). Pure.
 *
 * Quantities and unit costs are Postgres numerics (stock_movements
 * quantity_delta numeric(16,4), unit_cost numeric(12,4); order_item_costs
 * unit_cost numeric(12,4)). Their product has eight decimals, more than a
 * float keeps, so every value here is multiplied EXACTLY (BigInt) and rounded
 * once to centavos, half away from zero: the same as SQL `round(a * b * 100)`
 * in supabase/migrations/20261022120300_report_profit.sql. Rounding is per
 * movement / per order line, so a void that mirrors its sale nets to exactly 0.
 */

type Numeric = number | string

// BigInt() calls, not literals: the project compiles to ES2017.
const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const TEN = BigInt(10)
const HUNDRED = BigInt(100)

interface Decimal {
  /** value = units / 10^scale */
  units: bigint
  scale: number
}

const DECIMAL_PATTERN = /^([+-])?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i

/** An exact decimal from a numeric's text or a JSON number; null when unreadable. */
export function parseDecimal(value: Numeric | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const text = typeof value === 'number' ? String(value) : value.trim()
  const match = DECIMAL_PATTERN.exec(text)
  if (!match) return null
  const [, sign, whole = '', fraction = '', exponent = '0'] = match
  if (whole === '' && fraction === '') return null
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  let scale = fraction.length - Number(exponent)
  let units = BigInt(digits)
  if (scale < 0) {
    units *= TEN ** BigInt(-scale)
    scale = 0
  }
  return { units: sign === '-' ? -units : units, scale }
}

/** units / 10^scale rounded to a whole number, half away from zero. */
function roundHalfAway(units: bigint, scale: number): number {
  if (scale === 0) return Number(units)
  const divisor = TEN ** BigInt(scale)
  const magnitude = units < ZERO ? -units : units
  const quotient = magnitude / divisor
  const rounded = (magnitude % divisor) * TWO >= divisor ? quotient + ONE : quotient
  const result = Number(rounded)
  return units < ZERO && result !== 0 ? -result : result
}

/** round(a × b × 100), exactly; null when either side is missing or unreadable. */
export function productCents(a: Numeric | null | undefined, b: Numeric | null | undefined): number | null {
  const left = parseDecimal(a)
  const right = parseDecimal(b)
  if (!left || !right) return null
  return roundHalfAway(left.units * right.units * HUNDRED, left.scale + right.scale)
}

/** Ledger reasons that are use of stock (not deliveries or transfers between branches). */
export const USAGE_REASONS = ['sale', 'void', 'waste', 'stocktake'] as const
export type UsageReason = (typeof USAGE_REASONS)[number]

export function isUsageReason(reason: string): reason is UsageReason {
  return (USAGE_REASONS as readonly string[]).includes(reason)
}

/**
 * What a movement took out of stock, at its frozen cost: −quantity_delta ×
 * unit_cost. A sale (negative delta) is a cost, a void (positive) gives it
 * back, a count that finds more than the ledger expected is negative. Null =
 * the movement has no recorded cost ("uncosted").
 */
export function movementCostCents(quantityDelta: Numeric, unitCost: Numeric | null): number | null {
  if (unitCost === null) return null
  const cents = productCents(quantityDelta, unitCost)
  return cents === null ? null : cents === 0 ? 0 : -cents
}

/** A dish's cost at sale × the quantity on its order line. */
export function lineCostCents(unitCost: Numeric, quantity: number): number {
  return productCents(unitCost, quantity) ?? 0
}
