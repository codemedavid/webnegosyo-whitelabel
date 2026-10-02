/**
 * A shift is a drawer with a name on it.
 *
 * The sales screens answer "how much did the store make"; these rules answer
 * the owner's other end-of-day question — "how much cash should THIS person
 * hand me, and does what they counted match it". Pure and side-effect free:
 * the screen owns the fetching (shift-service.ts owns the rows), this owns
 * the arithmetic, mirroring pos-sales.ts.
 */

import type { CashMoveTotals } from "./cash-drawers";

/** Same centavo rounding as pos-sales.ts, so the two never disagree. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * No real drawer holds this much. Refusing it catches a stray extra digit and
 * keeps the write clear of the NUMERIC(12,2) column's overflow error.
 */
export const MAX_DRAWER_CASH = 10_000_000;

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
  if (value > MAX_DRAWER_CASH) {
    return { ok: false, reason: "That amount is too large for a drawer. Check for an extra digit." };
  }
  return { ok: true, amount: value };
}

// A leading minus is READ, so validateCashAmount can say "negative" rather
// than "not a number" — and still refuse it.
const CASH_TEXT = /^-?(\d+(\.\d+)?|\.\d+)$/;
/** One comma followed by one or two digits is a decimal comma ("125,50"). */
const DECIMAL_COMMA = /^\d+,\d{1,2}$/;

/**
 * What a cashier typed into a cash field, as a number — or NaN.
 *
 * A tablet's decimal pad offers a comma in some locales, and cashiers type
 * "1,250" or "₱300" out of habit; `Number()` read all three as NaN and the
 * shift refused a correct count. What it read too generously is refused here:
 * `Number("1e5")` is 100000 and `Number("0x10")` is 16, neither of which is
 * money anyone typed. NaN goes on to validateCashAmount, which says why.
 */
export function parseCashInput(text: string): number {
  const bare = text.replace(/\s+/g, "").replace(/^(₱|php)/i, "");
  const normalized = DECIMAL_COMMA.test(bare) ? bare.replace(",", ".") : bare.replace(/,(?=\d{3}(\D|$))/g, "");
  return CASH_TEXT.test(normalized) ? Number(normalized) : Number.NaN;
}

/**
 * Whether a newest-first page of orders holds EVERY order since the shift
 * opened.
 *
 * A short page is the whole history. A FULL page is still whole for this
 * shift when its oldest order predates the clock-in — the page reached past
 * the shift, so nothing inside it was cut off. Judging on page length alone
 * refused to reconcile every store that had ever taken 200 orders, so End
 * shift could never be confirmed there.
 */
export function isShiftHistoryComplete(
  orders: readonly { _creationTime: number }[],
  pageLimit: number,
  openedAt: string,
): boolean {
  if (orders.length < pageLimit) return true;
  const openedAtMs = Date.parse(openedAt);
  if (!Number.isFinite(openedAtMs)) return false;
  return orders.some((order) => order._creationTime < openedAtMs);
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
  /**
   * Cash that moved without a sale: added (pay in), spent (pay out), or taken
   * out to the owner mid-shift (collected). Absent = none.
   */
  moves?: CashMoveTotals;
  /**
   * A zero-balance drawer keeps nothing at close: every peso counted is
   * handed over, so the turnover is the whole drawer, not the drawer less
   * the float.
   */
  isZeroBalance?: boolean;
}

export type ShiftVerdict = "uncounted" | "balanced" | "over" | "short";

export interface ShiftReconciliation {
  /** What the drawer should hold at close: float + cash taken + pay ins − pay outs − pickups. */
  expectedInDrawer: number;
  /**
   * What the staff member hands over at close. The float goes back in the
   * drawer for the next shift — calling the whole drawer "turnover" would
   * accuse every cashier of keeping the float. On a zero-balance drawer
   * nothing goes back, so it is the whole drawer.
   */
  expectedTurnover: number;
  /** What stays in the drawer for the next shift. 0 on a zero-balance drawer. */
  floatToKeep: number;
  /** What is actually handed over once counted (count − float kept). Null until counted. */
  handOver: number | null;
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
  const moves = input.moves ?? { payIn: 0, payOut: 0, collected: 0 };
  const expectedInDrawer = round2(
    input.openingFloat + input.cashCollected + moves.payIn - moves.payOut - moves.collected,
  );
  const floatToKeep = input.isZeroBalance ? 0 : round2(input.openingFloat);
  const expectedTurnover = Math.max(0, round2(expectedInDrawer - floatToKeep));

  // `?? null` and an explicit null-check rather than falsiness: a counted
  // drawer of zero pesos is a count, not an uncounted drawer.
  const counted = input.countedCash ?? null;
  if (counted === null) {
    return { expectedInDrawer, expectedTurnover, floatToKeep, handOver: null, variance: null, verdict: "uncounted" };
  }

  return { expectedInDrawer, expectedTurnover, floatToKeep, ...judgeCount(expectedInDrawer, floatToKeep, counted) };
}

export interface CountJudgement {
  variance: number;
  verdict: Exclude<ShiftVerdict, "uncounted">;
  handOver: number;
}

/**
 * One count against one expectation — what the close sheet shows live as
 * the cashier types, and what reconcileShift records. One function, so the
 * preview can never promise a different verdict from the one saved.
 */
export function judgeCount(expectedInDrawer: number, floatToKeep: number, counted: number): CountJudgement {
  const variance = round2(counted - expectedInDrawer);
  const verdict = variance === 0 ? "balanced" : variance > 0 ? "over" : "short";
  return { variance, verdict, handOver: Math.max(0, round2(counted - floatToKeep)) };
}
