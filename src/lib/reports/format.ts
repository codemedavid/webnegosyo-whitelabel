/**
 * How report numbers read (plan §4 "Numbers"). Money arrives in centavos from
 * the sales model and is only turned into text here.
 *
 * - Summaries have no centavos; transactions, unit costs and COGS keep them.
 * - Negative values use U+2212, not a hyphen.
 * - `₱1.2M` only on chart axes.
 * - An unknown value is "—" (`UNKNOWN_FIGURE`), never ₱0 or 0%.
 *
 * Plain module: server and client components both import it.
 */

export const MINUS = '−'
export const UNKNOWN_FIGURE = '—'

const PESO_WHOLE = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const PESO_CENTAVOS = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const PESO_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'PHP',
  currencyDisplay: 'narrowSymbol',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const COUNT = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

/** Below this, an axis label reads in whole pesos ("₱500", not "₱0.5K"). */
const COMPACT_FROM_CENTS = 100_000

export interface MoneyFormat {
  /** Keep the centavos (transactions, unit costs, COGS). */
  centavos?: boolean
}

function withMinus(isNegative: boolean, text: string): string {
  return isNegative ? `${MINUS}${text}` : text
}

export function formatMoney(cents: number | null | undefined, { centavos = false }: MoneyFormat = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return UNKNOWN_FIGURE
  const pesos = Math.abs(cents) / 100
  const text = centavos ? PESO_CENTAVOS.format(pesos) : PESO_WHOLE.format(pesos)
  const isZero = centavos ? Math.abs(cents) === 0 : Math.round(pesos) === 0
  return withMinus(cents < 0 && !isZero, text)
}

/** "+₱2,500" / "−₱2,500" / "₱0": for changes, where the sign is the point. */
export function formatSignedMoney(cents: number | null | undefined, format: MoneyFormat = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return UNKNOWN_FIGURE
  const text = formatMoney(cents, format)
  return cents > 0 && text !== formatMoney(0, format) ? `+${text}` : text
}

/** Chart axes only: "₱1.2M", "₱4.5K". */
export function formatMoneyAxis(cents: number): string {
  if (Math.abs(cents) < COMPACT_FROM_CENTS) return formatMoney(cents)
  return withMinus(cents < 0, PESO_COMPACT.format(Math.abs(cents) / 100))
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN_FIGURE
  return withMinus(value < 0 && Math.round(value) !== 0, COUNT.format(Math.abs(value)))
}

export interface RatioFormat {
  /** Decimal places (default 0). */
  digits?: number
}

/** 0.1234 → "12%". */
export function formatRatio(ratio: number | null | undefined, { digits = 0 }: RatioFormat = {}): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return UNKNOWN_FIGURE
  const text = `${(Math.abs(ratio) * 100).toFixed(digits)}%`
  return withMinus(ratio < 0 && Number(text.slice(0, -1)) !== 0, text)
}
