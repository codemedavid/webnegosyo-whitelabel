/**
 * What a drawer says about the person who held it.
 *
 * `staff_shifts` stores four numbers and two stamps; the Team directory, a
 * person's profile and the shift list all ask the same three questions of
 * them — how long were they on, how much cash did they hand over, did the
 * count match. Answering that in each component is how one shift comes to
 * read "Short ₱50" on the profile and "closed" on the list.
 *
 * The verdict itself is `shift.ts`'s `reconcileShift`, not a second opinion:
 * the cashier's own drawer screen and the owner's report must never disagree
 * about whether a shift balanced.
 *
 * Mirrors `src/lib/staff-activity/shift-summary.ts` on the web.
 */

import { reconcileShift } from "../shift";
import type { ShiftRecord } from "../shift-service";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ShiftVerdictKind = "open" | "uncounted" | "balanced" | "over" | "short";

export interface ShiftVerdict {
  kind: ShiftVerdictKind;
  /** Counted minus expected, in pesos. Null while there is nothing to compare. */
  variance: number | null;
}

/** Cash this shift took, net of the float it started with. Null until known. */
export function shiftTurnover(shift: ShiftRecord): number | null {
  if (shift.expectedCash === null) return null;
  return Math.max(0, round2(shift.expectedCash - shift.openingFloat));
}

/**
 * Open, balanced, or off — and by how much.
 *
 * `uncounted` is its own answer rather than a zero variance: a closed shift
 * nobody counted is a missing fact, and printing ₱0 would report it as a
 * perfectly reconciled drawer.
 */
export function verdictForShift(shift: ShiftRecord): ShiftVerdict {
  if (shift.status === "open") return { kind: "open", variance: null };

  const collected = shiftTurnover(shift);
  if (collected === null) return { kind: "uncounted", variance: null };

  const reconciled = reconcileShift({
    openingFloat: shift.openingFloat,
    cashCollected: collected,
    countedCash: shift.closingCount,
  });
  return { kind: reconciled.verdict, variance: reconciled.variance };
}

/** How long the drawer was theirs — up to now while it is still open. */
export function shiftDurationMs(shift: ShiftRecord, nowMs: number): number {
  const opened = Date.parse(shift.openedAt);
  const closed = shift.closedAt ? Date.parse(shift.closedAt) : nowMs;
  return Math.max(0, closed - opened);
}

export interface ShiftTotals {
  count: number;
  /** Drawers still open right now. */
  openCount: number;
  /** Closed shifts someone actually counted. */
  countedCount: number;
  workedMs: number;
  /** Cash handed over across the counted shifts. */
  turnover: number;
  /** Net drift across counted shifts. Null when nothing was counted. */
  netVariance: number | null;
  shortCount: number;
  overCount: number;
}

export const EMPTY_SHIFT_TOTALS: ShiftTotals = {
  count: 0,
  openCount: 0,
  countedCount: 0,
  workedMs: 0,
  turnover: 0,
  netVariance: null,
  shortCount: 0,
  overCount: 0,
};

/** One person's — or one team's — drawer history, added up. */
export function summarizeShifts(shifts: readonly ShiftRecord[], nowMs: number): ShiftTotals {
  return shifts.reduce<ShiftTotals>((totals, shift) => {
    const verdict = verdictForShift(shift);
    const turnover = shiftTurnover(shift);
    const isCounted = verdict.variance !== null;

    return {
      count: totals.count + 1,
      openCount: totals.openCount + (shift.status === "open" ? 1 : 0),
      countedCount: totals.countedCount + (isCounted ? 1 : 0),
      workedMs: totals.workedMs + shiftDurationMs(shift, nowMs),
      turnover: round2(totals.turnover + (isCounted && turnover !== null ? turnover : 0)),
      netVariance: isCounted
        ? round2((totals.netVariance ?? 0) + (verdict.variance ?? 0))
        : totals.netVariance,
      shortCount: totals.shortCount + (verdict.kind === "short" ? 1 : 0),
      overCount: totals.overCount + (verdict.kind === "over" ? 1 : 0),
    };
  }, EMPTY_SHIFT_TOTALS);
}
