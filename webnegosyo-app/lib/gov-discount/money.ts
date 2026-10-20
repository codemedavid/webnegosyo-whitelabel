/**
 * Centavo arithmetic for the government-discount engine.
 *
 * Every figure the law produces (price ÷ 1.12, then 20%) is rounded ONCE per
 * claimant share, to the centavo, and everything else is derived by
 * subtraction — so the parts always add back up to the whole.
 */

const CENTAVOS_PER_PESO = 100

/** Pesos (possibly fractional or junk) → whole centavos. Junk is zero. */
export function toCents(pesos: number): number {
  if (!Number.isFinite(pesos)) return 0
  return Math.round(pesos * CENTAVOS_PER_PESO)
}

export function toPesos(cents: number): number {
  return cents / CENTAVOS_PER_PESO
}

/** VAT-inclusive centavos → the VAT-exclusive base (÷ 1.12), rounded. */
export function vatExclusive(cents: number): number {
  return Math.round((cents * 100) / 112)
}

/** `percent`% of an amount, rounded to the centavo. */
export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100)
}

/** 12% VAT on a VAT-exclusive amount, rounded to the centavo. */
export function vatOn(cents: number): number {
  return Math.round((cents * 12) / 100)
}

/**
 * Split `total` across `weights` in proportion, so the parts sum EXACTLY to
 * `total` (largest remainder). Zero/negative weights get nothing; with no
 * positive weight everything is zero.
 */
export function allocateCents(total: number, weights: readonly number[]): number[] {
  const positive = weights.map((weight) => (weight > 0 ? weight : 0))
  const weightSum = positive.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0 || weightSum === 0) return positive.map(() => 0)

  const exact = positive.map((weight) => (total * weight) / weightSum)
  const floors = exact.map(Math.floor)
  let left = total - floors.reduce((sum, value) => sum + value, 0)

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  const result = [...floors]
  for (const { index } of byRemainder) {
    if (left <= 0) break
    if (positive[index] === 0) continue
    result[index] += 1
    left -= 1
  }
  return result
}
