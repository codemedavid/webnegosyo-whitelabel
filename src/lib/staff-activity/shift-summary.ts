/**
 * What a drawer says about the person who held it.
 *
 * `staff_shifts` stores four numbers and two stamps; every staff surface on
 * the web asks the same three questions of them — how long were they on, how
 * much cash did they hand over, and did the count match. Answering that in
 * each component is how a shift comes to read "Short ₱50" on the profile and
 * "Balanced" on the list.
 *
 * The arithmetic mirrors the merchant app's `reconcileShift` deliberately:
 * turnover is the cash COLLECTED (the float goes back in the drawer for the
 * next shift), and variance is counted minus expected. Calling the whole
 * drawer turnover would accuse every cashier of pocketing the float.
 *
 * Pure: the pages fetch, this decides.
 */

import type { StaffShiftRecord } from './staff-activity-service'

/** Same centavo rounding as the app's shift rules, so the two never disagree. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export type ShiftVerdictKind = 'open' | 'uncounted' | 'balanced' | 'over' | 'short'

export interface ShiftVerdict {
  kind: ShiftVerdictKind
  /** Counted minus expected, in pesos. Null while there is nothing to compare. */
  variance: number | null
}

/**
 * Open, balanced, or off — and by how much.
 *
 * `uncounted` is its own answer rather than a zero variance: a closed shift
 * with no count is a missing fact, and printing ₱0 would report it as a
 * perfectly reconciled drawer.
 */
export function judgeShift(shift: StaffShiftRecord): ShiftVerdict {
  if (shift.status === 'open') return { kind: 'open', variance: null }
  if (shift.expectedCash === null || shift.closingCount === null) {
    return { kind: 'uncounted', variance: null }
  }

  const variance = round2(shift.closingCount - shift.expectedCash)
  if (variance === 0) return { kind: 'balanced', variance: 0 }
  return { kind: variance < 0 ? 'short' : 'over', variance }
}

/** Cash this shift took, net of the float it started with. Null until known. */
export function shiftTurnover(shift: StaffShiftRecord): number | null {
  if (shift.expectedCash === null) return null
  return Math.max(0, round2(shift.expectedCash - shift.openingFloat))
}

/** How long the drawer was theirs — up to now while it is still open. */
export function shiftDurationMs(shift: StaffShiftRecord, nowMs: number): number {
  const opened = Date.parse(shift.openedAt)
  const closed = shift.closedAt ? Date.parse(shift.closedAt) : nowMs
  return Math.max(0, closed - opened)
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** `7h 20m`, or `45m` under the hour. Never an empty string. */
export function formatShiftLength(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`
}

export interface ShiftTotals {
  count: number
  /** Drawers still open right now. */
  openCount: number
  /** Closed shifts someone actually counted. */
  countedCount: number
  workedMs: number
  /** Cash handed over across the counted shifts. */
  turnover: number
  /** Net drift across counted shifts. Null when nothing was counted. */
  netVariance: number | null
  shortCount: number
  overCount: number
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
}

/** One person's — or one team's — drawer history, added up. */
export function summarizeShifts(shifts: readonly StaffShiftRecord[], nowMs: number): ShiftTotals {
  return shifts.reduce<ShiftTotals>((totals, shift) => {
    const verdict = judgeShift(shift)
    const turnover = shiftTurnover(shift)
    const isCounted = verdict.variance !== null

    return {
      count: totals.count + 1,
      openCount: totals.openCount + (shift.status === 'open' ? 1 : 0),
      countedCount: totals.countedCount + (isCounted ? 1 : 0),
      workedMs: totals.workedMs + shiftDurationMs(shift, nowMs),
      turnover: round2(totals.turnover + (isCounted && turnover !== null ? turnover : 0)),
      netVariance: isCounted ? round2((totals.netVariance ?? 0) + (verdict.variance ?? 0)) : totals.netVariance,
      shortCount: totals.shortCount + (verdict.kind === 'short' ? 1 : 0),
      overCount: totals.overCount + (verdict.kind === 'over' ? 1 : 0),
    }
  }, EMPTY_SHIFT_TOTALS)
}
