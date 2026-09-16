/**
 * A shift is a drawer with a name on it.
 *
 * The sales screens answer "how much did the store make"; these rules answer
 * the owner's other end-of-day question — "how much cash should THIS person
 * hand me, and does what they counted match it". Pure and side-effect free:
 * the screen owns the fetching (shift-service.ts owns the rows), this owns
 * the arithmetic, mirroring pos-sales.ts.
 */

/** Same centavo rounding as pos-sales.ts, so the two never disagree. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A cash amount the drawer can actually hold, or why it cannot. */
export type CashAmountVerdict =
  | { ok: true; amount: number }
  | { ok: false; reason: string };

/**
 * Whether a typed amount is a real quantity of cash.
 *
 * Refused rather than clamped: a cashier meaning 500 and typing -500 should
 * be corrected, not have the register quietly decide what they meant. NaN is
 * refused for the same reason — a blank field is not a zero float.
 */
export function validateCashAmount(value: number): CashAmountVerdict {
  if (!Number.isFinite(value)) {
    return { ok: false, reason: "Enter the amount as a number." };
  }
  if (value < 0) {
    return { ok: false, reason: "A cash amount cannot be negative." };
  }
  return { ok: true, amount: value };
}

export type ShiftState = "open" | "closed";

/** Open or closed, judged by the one fact that cannot lie: the close stamp. */
export function judgeShift(shift: { closed_at: string | null }): ShiftState {
  return shift.closed_at === null ? "open" : "closed";
}

export interface ReconcileInput {
  /** Cash in the drawer when the shift opened. */
  openingFloat: number;
  /** Net cash this shift took (already net of cash refunds and change). */
  cashCollected: number;
  /** What the drawer held when counted at close. Absent until counted. */
  countedCash?: number | null;
}

export type ShiftVerdict = "uncounted" | "balanced" | "over" | "short";

export interface ShiftReconciliation {
  /** What the drawer should hold at close: float plus cash taken. */
  expectedInDrawer: number;
  /**
   * What the staff member hands over: the cash they COLLECTED. The float goes
   * back in the drawer for the next shift — calling the whole drawer
   * "turnover" would accuse every cashier of keeping the float.
   */
  expectedTurnover: number;
  /** counted − expected, in pesos. Null until the drawer is counted. */
  variance: number | null;
  verdict: ShiftVerdict;
}

/**
 * The drawer's answer sheet.
 *
 * All figures pass through the same centavo rounding, so 0.1 + 0.2 of float
 * arithmetic can never flag a correctly counted drawer as short.
 */
export function reconcileShift(input: ReconcileInput): ShiftReconciliation {
  const expectedInDrawer = round2(input.openingFloat + input.cashCollected);
  const expectedTurnover = round2(input.cashCollected);

  // `?? null` and an explicit null-check rather than falsiness: a counted
  // drawer of zero pesos is a count, not an uncounted drawer.
  const counted = input.countedCash ?? null;
  if (counted === null) {
    return { expectedInDrawer, expectedTurnover, variance: null, verdict: "uncounted" };
  }

  const variance = round2(counted - expectedInDrawer);
  const verdict: ShiftVerdict =
    variance === 0 ? "balanced" : variance > 0 ? "over" : "short";

  return { expectedInDrawer, expectedTurnover, variance, verdict };
}
