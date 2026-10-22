/**
 * Cash that entered or left a drawer without a sale, as the staff pages show it.
 *
 * `shift_cash_movements` holds three kinds: `collect` (a pickup to the owner
 * or safe), `pay_in` (change added) and `pay_out` (cash spent from the till —
 * ice, LPG, a rider). The shift list used to keep only pickups, so money spent
 * out of a drawer was netted into its expected cash and never named: the owner
 * saw a smaller turnover with no reason beside it.
 *
 * Pure: the service reads, this sums. Totals are summed in whole centavos so a
 * column of ₱0.10s never drifts.
 */

export type ShiftCashMoveKind = 'collect' | 'pay_in' | 'pay_out'

/** One row of the embedded `shift_cash_movements` read. */
export interface ShiftCashMoveRow {
  kind: string
  amount: number | string
  reason?: string | null
  recorded_by_name?: string | null
  created_at?: string | null
  /** The expense a pay-out was filed as (embedded `expenses`, with its category). */
  expenses?: ReadonlyArray<{ status?: string | null; expense_categories?: { name?: string | null } | null }> | null
}

/** One pay-out, named for the owner reading the shift. */
export interface ShiftPayOut {
  amount: number
  reason: string | null
  recordedByName: string | null
  createdAt: string | null
  /** The category it was sorted into (its RECORDED expense); null = not sorted yet. */
  categoryName: string | null
}

export interface ShiftCashMoveSummary {
  /** Cash taken out to the owner mid-shift (pickups). */
  collected: number
  /** Cash added to the drawer mid-shift. */
  paidIn: number
  /** Cash spent from the drawer mid-shift. */
  paidOut: number
  /** Every pay-out, oldest first. */
  payOuts: ShiftPayOut[]
}

const CENTAVOS_PER_PESO = 100

function toCentavos(amount: number | string): number {
  const value = Number(amount)
  return Number.isFinite(value) ? Math.round(value * CENTAVOS_PER_PESO) : 0
}

function totalOf(moves: readonly ShiftCashMoveRow[], kind: ShiftCashMoveKind): number {
  const centavos = moves
    .filter((move) => move.kind === kind)
    .reduce((sum, move) => sum + toCentavos(move.amount), 0)
  return centavos / CENTAVOS_PER_PESO
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** A voided drawer expense put the cash back: only the recorded one names the pay-out. */
function sortedCategoryName(move: ShiftCashMoveRow): string | null {
  const recorded = (move.expenses ?? []).find((expense) => expense.status === 'recorded')
  return trimmedOrNull(recorded?.expense_categories?.name)
}

function byCreatedAt(a: ShiftPayOut, b: ShiftPayOut): number {
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

export function summarizeShiftCashMoves(
  moves: readonly ShiftCashMoveRow[] | null | undefined,
): ShiftCashMoveSummary {
  const rows = moves ?? []
  const payOuts = rows
    .filter((move) => move.kind === 'pay_out')
    .map((move) => ({
      amount: toCentavos(move.amount) / CENTAVOS_PER_PESO,
      reason: trimmedOrNull(move.reason),
      recordedByName: trimmedOrNull(move.recorded_by_name),
      createdAt: move.created_at ?? null,
      categoryName: sortedCategoryName(move),
    }))
    .sort(byCreatedAt)

  return {
    collected: totalOf(rows, 'collect'),
    paidIn: totalOf(rows, 'pay_in'),
    paidOut: totalOf(rows, 'pay_out'),
    payOuts,
  }
}
