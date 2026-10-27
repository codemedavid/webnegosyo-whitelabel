/**
 * The Cashiers tab: one line per cashier, their last shifts as a strip of
 * short/over bars, and a sentence that describes a PATTERN, never a verdict.
 * Pure, so the wording is tested.
 */

import type { CashierReportRow, CashShiftReportRow } from '@/lib/cash/cash-reports'
import { formatSignedMoney } from '@/lib/reports/format'

/** Shifts shown in the strip, newest last (06 §4.5). */
export const STRIP_SHIFTS = 14

export interface CashierTrend {
  key: string
  name: string
  /** Oldest → newest; null = that shift had no count (open, forced, no expected figure). */
  strip: Array<number | null>
  summary: CashierReportRow | null
  /** "Short 3 times in 14 shifts · −₱260 in all" / "No short or over in 9 shifts". */
  sentence: string
  /** Shifts where the second count changed the first. */
  recountChanged: number
}

function keyOf(row: { staffUserId: string | null; staffName: string }): string {
  return row.staffUserId ?? `name:${row.staffName.toLowerCase()}`
}

function times(count: number): string {
  return count === 1 ? 'once' : count === 2 ? 'twice' : `${count} times`
}

/** The pattern, in words. */
export function patternSentence(strip: ReadonlyArray<number | null>, totalShifts: number, overShortCents: number | null): string {
  const counted = strip.filter((value): value is number => value !== null)
  const short = counted.filter((value) => value < 0).length
  const over = counted.filter((value) => value > 0).length
  const shifts = `${strip.length} ${strip.length === 1 ? 'shift' : 'shifts'}`
  if (counted.length === 0) return `No counted shifts in the last ${totalShifts === 1 ? 'shift' : `${totalShifts} shifts`}`
  if (short === 0 && over === 0) return `No short or over in the last ${shifts}`
  const parts = [short > 0 ? `Short ${times(short)}` : null, over > 0 ? `over ${times(over)}` : null].filter(Boolean).join(', ')
  const lead = parts.charAt(0).toUpperCase() + parts.slice(1)
  const total = overShortCents === null ? '' : ` · ${formatSignedMoney(overShortCents, { centavos: true })} in all`
  return `${lead} in the last ${shifts}${total}`
}

export function buildCashierTrends(shifts: readonly CashShiftReportRow[], byStaff: readonly CashierReportRow[]): CashierTrend[] {
  const grouped = new Map<string, { name: string; rows: CashShiftReportRow[] }>()
  for (const shift of [...shifts].sort((a, b) => a.openedAt.localeCompare(b.openedAt))) {
    const key = keyOf(shift)
    const group = grouped.get(key) ?? { name: shift.staffName, rows: [] }
    grouped.set(key, { name: group.name, rows: [...group.rows, shift] })
  }
  const summaries = new Map(byStaff.map((row) => [keyOf(row), row]))
  const keys = [...new Set([...summaries.keys(), ...grouped.keys()])]

  return keys
    .map((key): CashierTrend => {
      const group = grouped.get(key)
      const summary = summaries.get(key) ?? null
      const recent = (group?.rows ?? []).slice(-STRIP_SHIFTS)
      const strip = recent.map((row) => (row.closedAt === null ? null : row.differenceCents))
      const recountChanged = summary?.recountChanged ?? recent.filter((row) => row.firstCountCents !== null && row.finalCountCents !== null && row.firstCountCents !== row.finalCountCents).length
      const recentTotal = strip.some((value) => value !== null) ? strip.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
      return {
        key,
        name: summary?.staffName ?? group?.name ?? 'Staff',
        strip,
        summary,
        sentence: patternSentence(strip, summary?.shifts ?? strip.length, recentTotal),
        recountChanged,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Bar geometry for the strip: height share of the largest |difference| (0..1), sign for direction. */
export function stripBars(strip: ReadonlyArray<number | null>): Array<{ share: number; direction: 'over' | 'short' | 'exact' | 'none' }> {
  const largest = Math.max(0, ...strip.map((value) => Math.abs(value ?? 0)))
  return strip.map((value) => {
    if (value === null) return { share: 0, direction: 'none' }
    if (value === 0 || largest === 0) return { share: 0, direction: 'exact' }
    return { share: Math.abs(value) / largest, direction: value > 0 ? 'over' : 'short' }
  })
}
