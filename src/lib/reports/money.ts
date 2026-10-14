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

/**
 * Shares `totalCents` in proportion to `weights` so the shares always add up
 * to the total (largest remainder). Ties go to the earlier share, so a
 * three-way split of ₱10 is 3.34, 3.33, 3.33. Negative or non-finite weights
 * count as zero; all-zero weights split evenly.
 */
export function allocateCents(totalCents: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return []
  const sign = totalCents < 0 ? -1 : 1
  const whole = Math.abs(totalCents)
  const positive = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const sum = positive.reduce((a, b) => a + b, 0)
  const basis = sum > 0 ? positive : weights.map(() => 1)
  const basisSum = sum > 0 ? sum : weights.length

  const exact = basis.map((weight) => (whole * weight) / basisSum)
  const floors = exact.map(Math.floor)
  const spare = whole - floors.reduce((a, b) => a + b, 0)
  const winners = new Set(
    exact
      .map((value, index) => ({ index, remainder: value - floors[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, spare)
      .map(({ index }) => index),
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
