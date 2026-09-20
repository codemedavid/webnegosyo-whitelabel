/**
 * Who moved an order — the pure half.
 *
 * The web admin, the merchant app's list, kitchen board, drawer and scanner
 * all change an order's status, and every one of them used to drop the person
 * doing it. This module owns the shape of the event they now leave behind, the
 * rule for when an event is worth writing, and the per-person summaries the
 * staff pages read. No I/O: `record-order-event.ts` writes, the pages fetch.
 *
 * The register's own sale is also an event ('placed', source 'pos', the
 * cashier as actor) so a staff page can list "punched through POS" from the
 * same table it lists "confirmed" from, on either order backend.
 */

export type OrderEventBackend = 'convex' | 'tenant_supabase' | 'platform_supabase'
export type OrderEventKind = 'placed' | 'status_changed'
export type OrderEventSource = 'pos' | 'online'

export interface OrderStatusEvent {
  id: string
  tenantId: string
  outletId: string | null
  backend: OrderEventBackend
  externalOrderId: string
  event: OrderEventKind
  status: string
  previousStatus: string | null
  source: OrderEventSource | null
  /** The order total as the writer saw it. Null when the writer did not know. */
  orderTotal: number | null
  actorUserId: string | null
  /** Snapshotted at write so a removed account keeps its history named. */
  actorName: string
  occurredAt: string
}

/** What a writer knows before the row exists. */
export interface OrderEventDraft {
  tenantId: string
  outletId?: string | null
  backend: OrderEventBackend
  externalOrderId: string
  event: OrderEventKind
  status: string
  previousStatus?: string | null
  source?: OrderEventSource | null
  orderTotal?: number | null
  actorUserId: string | null
  actorName: string
  occurredAt?: string
}

/**
 * Whether this draft says anything the log does not already.
 *
 * Both writers retry: the app's lifecycle post re-fires on every prep-time
 * save, and the web re-sends a status the order already holds. A second
 * 'confirmed' row for the same order would count one confirmation twice on
 * the shift report, so a draft is recorded only when it moves the order.
 * A 'placed' event is the order's first, by definition.
 */
export function shouldRecordEvent(
  last: Pick<OrderStatusEvent, 'event' | 'status'> | null,
  draft: Pick<OrderEventDraft, 'event' | 'status'>,
): boolean {
  if (draft.event === 'placed') return last === null
  if (last === null) return true
  return last.status !== draft.status
}

export type OrderActivityKind = 'pos_sale' | 'confirmed' | 'cancelled' | 'completed' | 'progressed'

/** The single word the reports use for an event. */
export function classifyEvent(event: Pick<OrderStatusEvent, 'event' | 'status' | 'source'>): OrderActivityKind {
  if (event.event === 'placed') return 'pos_sale'
  if (event.status === 'confirmed') return 'confirmed'
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'delivered') return 'completed'
  return 'progressed'
}

export interface ActivityWindow {
  startMs: number
  endMs: number
}

export interface StaffActivityRow {
  actorUserId: string
  actorName: string
  posSales: number
  posSalesTotal: number
  confirmed: number
  confirmedTotal: number
  cancelled: number
  completed: number
  /** Preparing / ready moves — kitchen work, counted so it is not invisible. */
  progressed: number
  lastActiveAt: string | null
}

const EMPTY_ROW = {
  posSales: 0,
  posSalesTotal: 0,
  confirmed: 0,
  confirmedTotal: 0,
  cancelled: 0,
  completed: 0,
  progressed: 0,
  lastActiveAt: null as string | null,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isInWindow(event: OrderStatusEvent, window: ActivityWindow): boolean {
  const at = Date.parse(event.occurredAt)
  return at >= window.startMs && at <= window.endMs
}

function laterOf(a: string | null, b: string): string {
  return a === null || Date.parse(b) > Date.parse(a) ? b : a
}

function addEvent(row: StaffActivityRow, event: OrderStatusEvent): StaffActivityRow {
  const kind = classifyEvent(event)
  const total = event.orderTotal ?? 0
  const next: StaffActivityRow = {
    ...row,
    // The latest name wins: a renamed account should read by its current name.
    actorName: laterOf(row.lastActiveAt, event.occurredAt) === event.occurredAt ? event.actorName : row.actorName,
    lastActiveAt: laterOf(row.lastActiveAt, event.occurredAt),
  }
  switch (kind) {
    case 'pos_sale':
      return { ...next, posSales: next.posSales + 1, posSalesTotal: round2(next.posSalesTotal + total) }
    case 'confirmed':
      return { ...next, confirmed: next.confirmed + 1, confirmedTotal: round2(next.confirmedTotal + total) }
    case 'cancelled':
      return { ...next, cancelled: next.cancelled + 1 }
    case 'completed':
      return { ...next, completed: next.completed + 1 }
    case 'progressed':
      return { ...next, progressed: next.progressed + 1 }
  }
}

function activityCount(row: StaffActivityRow): number {
  return row.posSales + row.confirmed + row.cancelled + row.completed + row.progressed
}

/**
 * One row per person for the window, busiest first.
 *
 * Events with no actor are dropped rather than bucketed: unlike a counter
 * sale (money that exists whoever rang it), an anonymous status change is
 * not activity anyone can be asked about.
 */
export function summarizeStaffActivity(
  events: readonly OrderStatusEvent[],
  window: ActivityWindow,
): StaffActivityRow[] {
  const rows = new Map<string, StaffActivityRow>()
  for (const event of events) {
    if (!event.actorUserId || !isInWindow(event, window)) continue
    const current = rows.get(event.actorUserId) ?? {
      ...EMPTY_ROW,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
    }
    rows.set(event.actorUserId, addEvent(current, event))
  }
  return [...rows.values()].sort((a, b) => activityCount(b) - activityCount(a))
}

/** One person's events inside the window, newest first. */
export function selectActorEvents(
  events: readonly OrderStatusEvent[],
  actorUserId: string,
  window: ActivityWindow,
): OrderStatusEvent[] {
  return events
    .filter((event) => event.actorUserId === actorUserId && isInWindow(event, window))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}
