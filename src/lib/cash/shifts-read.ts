/**
 * Shifts for a business day or a range of them (CONTRACTS §2 `staff_shifts`).
 *
 * - Grouped by the STORED `business_day` (stamped by the server when the shift
 *   opened), never re-derived: a 6 PM–3 AM shift is all Friday.
 * - Read through the CALLER's session client, so RLS decides what comes back;
 *   the branch is decided by the page (a branch-locked account always passes
 *   its own outlet), like `report-context.ts`.
 * - Paged past the 1000-row API cap, with a ceiling that fails loudly.
 * - Money: `staff_shifts` keeps its peso columns; they become centavos here.
 *
 * The short/over arithmetic mirrors the app's `reconcileShift` and the staff
 * page's `judgeShift`: difference = counted − expected. A shift without a
 * count is "uncounted", never "Exact".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { toCents } from '@/lib/reports/money'

export interface CashShift {
  id: string
  outletId: string | null
  staffUserId: string | null
  staffName: string
  drawerName: string | null
  status: 'open' | 'closed'
  openingFloatCents: number
  /** What the drawer should hold; null until known. */
  expectedCents: number | null
  /** What was counted; null = no count. */
  countedCents: number | null
  openedAt: string
  closedAt: string | null
  businessDay: string
  servicePeriodId: string | null
  isBlind: boolean
  closeKind: string | null
  /** A reason chip key (CONTRACTS §6), when the cashier gave one. */
  varianceReason: string | null
  isZeroBalance: boolean
  closedByName: string | null
}

const COLUMNS =
  'id, outlet_id, staff_user_id, staff_name, drawer_name, status, opening_float, expected_cash, closing_count, opened_at, closed_at, business_day, service_period_id, is_blind, close_kind, variance_reason, is_zero_balance, closed_by_name'

const PAGE_SIZE = 1000
/** Ten pages. A store with more shifts than this in one read is a bug, not a day. */
export const MAX_SHIFT_ROWS = 10 * PAGE_SIZE
/** The reports' own ceiling (period.ts MAX_REPORT_DAYS). */
const MAX_RANGE_DAYS = 93

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

interface ShiftRow {
  id: string
  outlet_id: string | null
  staff_user_id: string | null
  staff_name: string | null
  drawer_name: string | null
  status: string
  opening_float: number | string | null
  expected_cash: number | string | null
  closing_count: number | string | null
  opened_at: string
  closed_at: string | null
  business_day: string | null
  service_period_id: string | null
  is_blind: boolean | null
  close_kind: string | null
  variance_reason: string | null
  is_zero_balance: boolean | null
  closed_by_name: string | null
}

function centsOrNull(value: number | string | null): number | null {
  return value === null || value === undefined || value === '' ? null : toCents(value)
}

function toCashShift(row: ShiftRow): CashShift {
  return {
    id: row.id,
    outletId: row.outlet_id,
    staffUserId: row.staff_user_id,
    staffName: row.staff_name?.trim() || 'Staff',
    drawerName: row.drawer_name?.trim() || null,
    status: row.status === 'open' ? 'open' : 'closed',
    openingFloatCents: toCents(row.opening_float),
    expectedCents: centsOrNull(row.expected_cash),
    countedCents: centsOrNull(row.closing_count),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    businessDay: row.business_day ?? row.opened_at.slice(0, 10),
    servicePeriodId: row.service_period_id,
    isBlind: row.is_blind === true,
    closeKind: row.close_kind,
    varianceReason: row.variance_reason,
    isZeroBalance: row.is_zero_balance === true,
    closedByName: row.closed_by_name,
  }
}

function assertDayKey(day: string): void {
  if (!DAY_KEY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))) {
    throw new Error(`Expected a YYYY-MM-DD business day, received "${day}"`)
  }
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00.000Z`) - Date.parse(`${fromDay}T00:00:00.000Z`)) / 86_400_000) + 1
}

interface RangeQuery {
  tenantId: string
  fromDay: string
  toDay: string
  /** null = every branch the caller reaches. */
  outletId: string | null
}

async function readPages(db: SupabaseClient, query: RangeQuery): Promise<CashShift[]> {
  const shifts: CashShift[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let request = db
      .from('staff_shifts')
      .select(COLUMNS)
      .eq('tenant_id', query.tenantId)
      .gte('business_day', query.fromDay)
      .lte('business_day', query.toDay)
    if (query.outletId) request = request.eq('outlet_id', query.outletId)
    const { data, error } = await request
      .order('opened_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Could not read the shifts: ${error.message}`)
    const page = (data ?? []) as unknown as ShiftRow[]
    shifts.push(...page.map(toCashShift))
    if (shifts.length > MAX_SHIFT_ROWS) throw new Error('Too many shifts to show at once. Pick a shorter range.')
    if (page.length < PAGE_SIZE) return shifts
  }
}

/** Every shift of business days `fromDay`..`toDay` (inclusive), oldest first. */
export function readShiftsForRange(db: SupabaseClient, query: RangeQuery): Promise<CashShift[]> {
  assertDayKey(query.fromDay)
  assertDayKey(query.toDay)
  const days = daysBetween(query.fromDay, query.toDay)
  if (days < 1 || days > MAX_RANGE_DAYS) {
    return Promise.reject(new Error(`A shift range is 1 to ${MAX_RANGE_DAYS} days.`))
  }
  return readPages(db, query)
}

/** The shifts of one business day, oldest first. */
export async function readShiftsForDay(
  db: SupabaseClient,
  query: { tenantId: string; day: string; outletId: string | null },
): Promise<CashShift[]> {
  assertDayKey(query.day)
  return readPages(db, { tenantId: query.tenantId, fromDay: query.day, toDay: query.day, outletId: query.outletId })
}

export type CashShiftVerdictKind = 'open' | 'uncounted' | 'exact' | 'short' | 'over'

export interface CashShiftVerdict {
  kind: CashShiftVerdictKind
  /** counted − expected in centavos; null when there is nothing to compare. */
  differenceCents: number | null
}

export function judgeCashShift(shift: Pick<CashShift, 'status' | 'expectedCents' | 'countedCents'>): CashShiftVerdict {
  if (shift.status === 'open') return { kind: 'open', differenceCents: null }
  if (shift.expectedCents === null || shift.countedCents === null) return { kind: 'uncounted', differenceCents: null }
  const differenceCents = shift.countedCents - shift.expectedCents
  if (differenceCents === 0) return { kind: 'exact', differenceCents: 0 }
  return { kind: differenceCents < 0 ? 'short' : 'over', differenceCents }
}

export interface CashShiftSummary {
  count: number
  openCount: number
  /** Closed shifts with a count and an expected figure. */
  countedCount: number
  /** Cash counted across those shifts. */
  countedCents: number
  /** Net short/over across them; null when nothing was counted. */
  netDifferenceCents: number | null
  shortCount: number
  overCount: number
  exactCount: number
}

export function summarizeCashShifts(shifts: readonly CashShift[]): CashShiftSummary {
  return shifts.reduce<CashShiftSummary>(
    (summary, shift) => {
      const verdict = judgeCashShift(shift)
      const isCounted = verdict.differenceCents !== null
      return {
        count: summary.count + 1,
        openCount: summary.openCount + (verdict.kind === 'open' ? 1 : 0),
        countedCount: summary.countedCount + (isCounted ? 1 : 0),
        countedCents: summary.countedCents + (isCounted ? (shift.countedCents ?? 0) : 0),
        netDifferenceCents: isCounted ? (summary.netDifferenceCents ?? 0) + (verdict.differenceCents ?? 0) : summary.netDifferenceCents,
        shortCount: summary.shortCount + (verdict.kind === 'short' ? 1 : 0),
        overCount: summary.overCount + (verdict.kind === 'over' ? 1 : 0),
        exactCount: summary.exactCount + (verdict.kind === 'exact' ? 1 : 0),
      }
    },
    { count: 0, openCount: 0, countedCount: 0, countedCents: 0, netDifferenceCents: null, shortCount: 0, overCount: 0, exactCount: 0 },
  )
}
