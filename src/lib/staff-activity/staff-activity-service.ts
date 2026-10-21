import 'server-only'

import { readPaged } from '@/lib/assistant/data/paged'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OrderStatusEvent } from './order-event'
import { summarizeShiftCashMoves, type ShiftCashMoveRow, type ShiftPayOut } from './shift-cash-moves'

/**
 * What the staff pages read, in one place.
 *
 * Read with the service-role client, as `loadBranchStaff` does: the page has
 * already established that the caller manages this store's staff. The window
 * is a closed interval in the caller's chosen days; `limit` is a ceiling on
 * the rows one page will hold, and the page says so when it is hit.
 */

export interface ActivityQuery {
  sinceIso: string
  untilIso?: string
  actorUserId?: string
  outletId?: string | null
  limit?: number
}

/**
 * The most rows one read holds. Above PostgREST's 1000-row cap, so the read
 * pages (two requests at most); a single `.limit(2000)` was silently answered
 * with 1000 rows and never reported itself truncated.
 */
export const ACTIVITY_ROW_CEILING = 2000

interface EventRow {
  id: string
  tenant_id: string
  outlet_id: string | null
  backend: string
  external_order_id: string
  event: string
  status: string
  previous_status: string | null
  source: string | null
  order_total: number | string | null
  actor_user_id: string | null
  actor_name: string
  occurred_at: string
}

export function toOrderStatusEvent(row: EventRow): OrderStatusEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    backend: row.backend as OrderStatusEvent['backend'],
    externalOrderId: row.external_order_id,
    event: row.event as OrderStatusEvent['event'],
    status: row.status,
    previousStatus: row.previous_status,
    source: row.source as OrderStatusEvent['source'],
    orderTotal: row.order_total === null ? null : Number(row.order_total),
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    occurredAt: row.occurred_at,
  }
}

export interface ActivityPage {
  events: OrderStatusEvent[]
  /** True when the ceiling was hit and older rows in the window were left out. */
  isTruncated: boolean
}

export async function loadOrderStatusEvents(tenantId: string, query: ActivityQuery): Promise<ActivityPage> {
  const limit = query.limit ?? ACTIVITY_ROW_CEILING
  const client = createAdminClient()
  // A fresh builder per page, on a total ordering (occurred_at, then id) so
  // rows cannot shift between pages and be skipped or read twice.
  const readPage = (from: number, to: number) => {
    let request = client
      .from('order_status_events')
      .select(
        'id, tenant_id, outlet_id, backend, external_order_id, event, status, previous_status, source, order_total, actor_user_id, actor_name, occurred_at',
      )
      .eq('tenant_id', tenantId)
      .gte('occurred_at', query.sinceIso)

    if (query.untilIso) request = request.lte('occurred_at', query.untilIso)
    if (query.actorUserId) request = request.eq('actor_user_id', query.actorUserId)
    if (query.outletId) request = request.eq('outlet_id', query.outletId)

    return request
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  }

  const { rows, isCapped } = await readPaged<EventRow>(
    (from, to) => readPage(from, to) as unknown as PromiseLike<{ data: EventRow[] | null; error: { message: string } | null }>,
    limit,
  )
  return { events: rows.map(toOrderStatusEvent), isTruncated: isCapped }
}

export interface StaffShiftRecord {
  id: string
  outletId: string | null
  staffUserId: string | null
  staffName: string
  status: 'open' | 'closed'
  openingFloat: number
  expectedCash: number | null
  closingCount: number | null
  note: string | null
  openedAt: string
  closedAt: string | null
  /** The till held ("Cashier 1"), snapshotted at clock-in. Absent = personal drawer. */
  drawerName?: string | null
  /** Started empty; everything counted was handed over at close. */
  isZeroBalance?: boolean
  /** Who counted and closed it, when a manager closed on the cashier's behalf. */
  closedByName?: string | null
  /** Cash taken out to the owner mid-shift (pickups). */
  collected?: number
  /** Cash added to the drawer mid-shift (more change, a top-up). */
  paidIn?: number
  /** Cash spent from the drawer mid-shift (ice, LPG, a rider). */
  paidOut?: number
  /** Each pay-out with its reason, oldest first. */
  payOuts?: ShiftPayOut[]
}

interface ShiftRow {
  id: string
  outlet_id: string | null
  staff_user_id: string | null
  staff_name: string
  status: string
  opening_float: number | string
  expected_cash: number | string | null
  closing_count: number | string | null
  note: string | null
  opened_at: string
  closed_at: string | null
  drawer_name?: string | null
  is_zero_balance?: boolean | null
  closed_by_name?: string | null
  shift_cash_movements?: ShiftCashMoveRow[] | null
}

export function toStaffShift(row: ShiftRow): StaffShiftRecord {
  const moves = summarizeShiftCashMoves(row.shift_cash_movements)
  return {
    id: row.id,
    outletId: row.outlet_id,
    staffUserId: row.staff_user_id,
    staffName: row.staff_name,
    status: row.status === 'closed' ? 'closed' : 'open',
    openingFloat: Number(row.opening_float),
    expectedCash: row.expected_cash === null ? null : Number(row.expected_cash),
    closingCount: row.closing_count === null ? null : Number(row.closing_count),
    note: row.note,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    drawerName: row.drawer_name ?? null,
    isZeroBalance: row.is_zero_balance === true,
    closedByName: row.closed_by_name ?? null,
    collected: moves.collected,
    paidIn: moves.paidIn,
    paidOut: moves.paidOut,
    payOuts: moves.payOuts,
  }
}

/** Shifts that were open at any point on or after `sinceIso`, newest first. */
export async function loadStaffShifts(
  tenantId: string,
  query: { sinceIso: string; staffUserId?: string },
): Promise<StaffShiftRecord[]> {
  let request = createAdminClient()
    .from('staff_shifts')
    .select(
      'id, outlet_id, staff_user_id, staff_name, status, opening_float, expected_cash, closing_count, note, opened_at, closed_at, drawer_name, is_zero_balance, closed_by_name, shift_cash_movements(kind, amount, reason, recorded_by_name, created_at)',
    )
    .eq('tenant_id', tenantId)
    .or(`closed_at.is.null,closed_at.gte.${query.sinceIso}`)
    .order('opened_at', { ascending: false })
    .limit(500)

  if (query.staffUserId) request = request.eq('staff_user_id', query.staffUserId)

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as ShiftRow[]).map(toStaffShift)
}
