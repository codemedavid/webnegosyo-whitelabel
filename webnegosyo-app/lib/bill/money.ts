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

function exactRemainders(
  whole: number,
  basis: readonly number[],
  basisSum: number,
): { floors: number[]; compare: (a: number, b: number) => number } {
  // Integer weights split EXACTLY (BigInt): float division gave equal
  // remainders different last bits, so a spare centavo could go to a later
  // share. The web copy (src/lib/reports/money.ts) does the same.
  const total = BigInt(whole);
  const divisor = BigInt(basisSum);
  const scaled = basis.map((weight) => total * BigInt(weight));
  const remainders = scaled.map((value) => value % divisor);
  return {
    floors: scaled.map((value) => Number(value / divisor)),
    compare: (a, b) => (remainders[b] > remainders[a] ? 1 : remainders[b] < remainders[a] ? -1 : a - b),
  };
}

function floatRemainders(
  whole: number,
  basis: readonly number[],
  basisSum: number,
): { floors: number[]; compare: (a: number, b: number) => number } {
  const exact = basis.map((weight) => (whole * weight) / basisSum);
  const floors = exact.map(Math.floor);
  return { floors, compare: (a, b) => exact[b] - floors[b] - (exact[a] - floors[a]) || a - b };
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

  const isExact = Number.isSafeInteger(whole) && Number.isSafeInteger(basisSum) && basis.every(Number.isSafeInteger);
  const { floors, compare } = (isExact ? exactRemainders : floatRemainders)(whole, basis, basisSum);
  const spare = whole - floors.reduce((a, b) => a + b, 0);
  const winners = new Set(
    floors
      .map((_, index) => index)
      .sort(compare)
      .slice(0, spare),
  );
  // Never -0: Intl formats it as "-₱0.00". The web copy (src/lib/reports/money.ts) does the same.
  return floors.map((share, index) => {
    const cents = share + (winners.has(index) ? 1 : 0);
    return cents === 0 ? 0 : cents * sign;
  });
}
