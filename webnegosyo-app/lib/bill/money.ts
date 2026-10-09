/**
 * Bills are split and settled in whole centavos. Float pesos drift (0.1 + 0.2)
 * and a split that drifts leaves a centavo nobody can pay.
 */

export function toCents(pesos: number): number {
  return Math.round(pesos * 100 + Number.EPSILON * Math.sign(pesos));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Share `totalCents` in proportion to `weights` so the shares always add up to
 * the total (largest remainder). Ties go to the earlier share, so "split three
 * ways" is stable: 3.34, 3.33, 3.33. All-zero weights split evenly.
 */
export function allocateCents(totalCents: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const whole = Math.abs(totalCents);
  const positive = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const sum = positive.reduce((a, b) => a + b, 0);
  const basis = sum > 0 ? positive : weights.map(() => 1);
  const basisSum = sum > 0 ? sum : weights.length;

  const exact = basis.map((weight) => (whole * weight) / basisSum);
  const floors = exact.map(Math.floor);
  let spare = whole - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const shares = [...floors];
  for (const { index } of byRemainder) {
    if (spare <= 0) break;
    shares[index] += 1;
    spare -= 1;
  }
  return shares.map((share) => share * sign);
}
