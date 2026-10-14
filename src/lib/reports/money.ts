/**
 * Report money is whole centavos (plan §5). Float pesos drift (0.1 + 0.2), and
 * a report whose rows don't add up to its total is one nobody trusts.
 *
 * `allocateCents` is the merchant app's bill-split rule
 * (`webnegosyo-app/lib/bill/money.ts`); `tests/unit/reports/money.test.ts`
 * fails if the two ever split an amount differently. `toCents` here also reads
 * Postgres numerics (strings) and rounds float halves such as 1.005 up, which
 * a plain `Math.round(pesos * 100)` gets wrong.
 */

/** Significant digits kept before rounding: wipes float noise, keeps every real centavo. */
const NOISE_DIGITS = 12

/**
 * Pesos → centavos, half away from zero. Blank, missing or non-numeric input
 * is 0: the caller decides whether "nothing recorded" matters.
 */
export function toCents(pesos: number | string | null | undefined): number {
  const value = typeof pesos === 'string' ? Number.parseFloat(pesos.trim()) : pesos
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const scaled = Number((Math.abs(value) * 100).toPrecision(NOISE_DIGITS))
  const cents = Math.round(scaled)
  return value < 0 && cents > 0 ? -cents : cents
}

export function fromCents(cents: number): number {
  return cents / 100
}

interface Remainders {
  floors: number[]
  /** Larger first wins a spare centavo; equal remainders go to the earlier share. */
  compare: (a: number, b: number) => number
}

/**
 * Integer weights (centavos, units) are split EXACTLY: share = ⌊whole·w / Σw⌋
 * with remainder whole·w mod Σw, in BigInt so nothing rounds. Float division
 * gave two equal remainders different last bits, so a spare centavo went to
 * whichever share the rounding favoured, not the earlier one, and the SQL
 * report functions (which divide exactly) disagreed by a centavo.
 */
function exactRemainders(whole: number, basis: readonly number[], basisSum: number): Remainders {
  const total = BigInt(whole)
  const divisor = BigInt(basisSum)
  const scaled = basis.map((weight) => total * BigInt(weight))
  const remainders = scaled.map((value) => value % divisor)
  return {
    floors: scaled.map((value) => Number(value / divisor)),
    compare: (a, b) => (remainders[b] > remainders[a] ? 1 : remainders[b] < remainders[a] ? -1 : a - b),
  }
}

/** Fractional weights: float division, as before (only bill splits by odd weights reach it). */
function floatRemainders(whole: number, basis: readonly number[], basisSum: number): Remainders {
  const exact = basis.map((weight) => (whole * weight) / basisSum)
  const floors = exact.map(Math.floor)
  return { floors, compare: (a, b) => exact[b] - floors[b] - (exact[a] - floors[a]) || a - b }
}

/**
 * Shares `totalCents` in proportion to `weights` so the shares always add up
 * to the total (largest remainder). Ties go to the earlier share, so a
 * three-way split of ₱10 is 3.34, 3.33, 3.33. Negative or non-finite weights
 * count as zero; all-zero weights split evenly. Mirrored by the SQL report
 * functions (`supabase/migrations/*_report_sales_functions.sql`).
 */
export function allocateCents(totalCents: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return []
  const sign = totalCents < 0 ? -1 : 1
  const whole = Math.abs(totalCents)
  const positive = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const sum = positive.reduce((a, b) => a + b, 0)
  const basis = sum > 0 ? positive : weights.map(() => 1)
  const basisSum = sum > 0 ? sum : weights.length

  const isExact = Number.isSafeInteger(whole) && Number.isSafeInteger(basisSum) && basis.every(Number.isSafeInteger)
  const { floors, compare } = (isExact ? exactRemainders : floatRemainders)(whole, basis, basisSum)
  const spare = whole - floors.reduce((a, b) => a + b, 0)
  const winners = new Set(
    floors
      .map((_, index) => index)
      .sort(compare)
      .slice(0, spare),
  )
  return floors.map((share, index) => {
    const cents = share + (winners.has(index) ? 1 : 0)
    // Never -0: it prints as "-0.00" and fails strict equality.
    return cents === 0 ? 0 : cents * sign
  })
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
