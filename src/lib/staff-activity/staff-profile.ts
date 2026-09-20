/**
 * The team as people, not as a list of events.
 *
 * The activity log answers "what happened"; the staff pages ask "who is Ana".
 * That means one row per person carrying everything at once — what they rang,
 * what they handled, whether their drawer is open right now, when they were
 * last seen — and, on their own page, the same facts cut by day.
 *
 * Three rules worth stating, because each one is a decision:
 *
 * - The owner is one of the people. They ring sales like anyone else, and a
 *   report that hides the busiest register is not a report.
 * - Someone removed from the roster keeps their history, flagged `isFormer`.
 *   Deleting an account must not rewrite last month's takings.
 * - Days are Manila days (`toBusinessDayKey`), the same boundary the database
 *   numbers orders by. A UTC cut would move the dinner rush to tomorrow.
 *
 * Pure: the pages fetch, this arranges.
 */

import { toBusinessDayKey } from '@/lib/inventory/business-day'
import type { StaffRecord } from '@/lib/staff-service'
import {
  classifyEvent,
  summarizeStaffActivity,
  type ActivityWindow,
  type OrderStatusEvent,
  type StaffActivityRow,
} from './order-event'
import { EMPTY_SHIFT_TOTALS, summarizeShifts, type ShiftTotals } from './shift-summary'
import type { StaffShiftRecord } from './staff-activity-service'

export const UNNAMED_ACCOUNT = 'Unnamed account'

/** How an account is named wherever the staff surfaces print it. */
export function staffDisplayName(member: Pick<StaffRecord, 'display_name' | 'email'>): string {
  return member.display_name || member.email || UNNAMED_ACCOUNT
}

export interface StaffDirectoryEntry {
  userId: string
  name: string
  email: string | null
  isOwner: boolean
  /** No longer on the roster — kept so their history stays attributable. */
  isFormer: boolean
  outletId: string | null
  /** Null means full access, as it does on `app_users`. */
  permissions: string[] | null
  defaultTab: string | null
  joinedAt: string | null
  activity: StaffActivityRow
  shifts: ShiftTotals
  /** The drawer they hold right now, if any. */
  openShift: StaffShiftRecord | null
  /** Latest of any order they touched or any shift they opened or closed. */
  lastActiveAt: string | null
}

export interface DirectoryInput {
  members: readonly StaffRecord[]
  events: readonly OrderStatusEvent[]
  shifts: readonly StaffShiftRecord[]
  window: ActivityWindow
  nowMs: number
}

function emptyActivity(userId: string, name: string): StaffActivityRow {
  return {
    actorUserId: userId,
    actorName: name,
    posSales: 0,
    posSalesTotal: 0,
    confirmed: 0,
    confirmedTotal: 0,
    cancelled: 0,
    completed: 0,
    progressed: 0,
    lastActiveAt: null,
  }
}

/** Total acts in the window — how "busy" is ordered. */
export function activityCount(row: StaffActivityRow): number {
  return row.posSales + row.confirmed + row.cancelled + row.completed + row.progressed
}

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return Date.parse(b) > Date.parse(a) ? b : a
}

function groupShiftsByStaff(
  shifts: readonly StaffShiftRecord[],
): Map<string, StaffShiftRecord[]> {
  const grouped = new Map<string, StaffShiftRecord[]>()
  for (const shift of shifts) {
    if (!shift.staffUserId) continue
    grouped.set(shift.staffUserId, [...(grouped.get(shift.staffUserId) ?? []), shift])
  }
  return grouped
}

function lastSeen(activity: StaffActivityRow, shifts: readonly StaffShiftRecord[]): string | null {
  return shifts.reduce<string | null>(
    (latest, shift) => laterOf(laterOf(latest, shift.openedAt), shift.closedAt),
    activity.lastActiveAt,
  )
}

function toEntry(
  identity: Omit<StaffDirectoryEntry, 'activity' | 'shifts' | 'openShift' | 'lastActiveAt'>,
  activity: StaffActivityRow,
  shifts: readonly StaffShiftRecord[],
  nowMs: number,
): StaffDirectoryEntry {
  return {
    ...identity,
    activity,
    shifts: shifts.length === 0 ? EMPTY_SHIFT_TOTALS : summarizeShifts(shifts, nowMs),
    openShift: shifts.find((shift) => shift.status === 'open') ?? null,
    lastActiveAt: lastSeen(activity, shifts),
  }
}

/**
 * On shift first — whoever is behind the counter right now is who the owner
 * opened this page to find. After that, busiest in the window, then most
 * recently seen, then alphabetically so the order is stable between refreshes.
 */
function compareEntries(a: StaffDirectoryEntry, b: StaffDirectoryEntry): number {
  if ((a.openShift !== null) !== (b.openShift !== null)) return a.openShift !== null ? -1 : 1
  const byActivity = activityCount(b.activity) - activityCount(a.activity)
  if (byActivity !== 0) return byActivity
  const bySeen = Date.parse(b.lastActiveAt ?? '0') - Date.parse(a.lastActiveAt ?? '0')
  if (!Number.isNaN(bySeen) && bySeen !== 0) return bySeen
  return a.name.localeCompare(b.name)
}

/** One row per person: the roster, plus anyone whose history outlives them. */
export function buildStaffDirectory(input: DirectoryInput): StaffDirectoryEntry[] {
  const activityRows = new Map(
    summarizeStaffActivity(input.events, input.window).map((row) => [row.actorUserId, row]),
  )
  const shiftsByStaff = groupShiftsByStaff(input.shifts)

  const entries = input.members.map((member) => {
    const name = staffDisplayName(member)
    return toEntry(
      {
        userId: member.user_id,
        name,
        email: member.email,
        isOwner: member.is_owner,
        isFormer: false,
        outletId: member.outlet_id ?? null,
        permissions: member.permissions,
        defaultTab: member.default_tab ?? null,
        joinedAt: member.created_at ?? null,
      },
      activityRows.get(member.user_id) ?? emptyActivity(member.user_id, name),
      shiftsByStaff.get(member.user_id) ?? [],
      input.nowMs,
    )
  })

  const known = new Set(entries.map((entry) => entry.userId))
  const formerIds = new Set(
    [...activityRows.keys(), ...shiftsByStaff.keys()].filter((userId) => !known.has(userId)),
  )

  const former = [...formerIds].map((userId) => {
    const shifts = shiftsByStaff.get(userId) ?? []
    const activity = activityRows.get(userId)
    const name = activity?.actorName ?? shifts[0]?.staffName ?? UNNAMED_ACCOUNT
    return toEntry(
      {
        userId,
        name,
        email: null,
        isOwner: false,
        isFormer: true,
        outletId: shifts[0]?.outletId ?? null,
        permissions: [],
        defaultTab: null,
        joinedAt: null,
      },
      activity ?? emptyActivity(userId, name),
      shifts,
      input.nowMs,
    )
  })

  return [...entries, ...former].sort(compareEntries)
}

export interface TeamStats {
  /** People on the roster now. Former staff are history, not headcount. */
  headcount: number
  onShift: number
  posSales: number
  posSalesTotal: number
  /** Every act in the window, POS sales included. */
  ordersHandled: number
  cancelled: number
  workedMs: number
  /** Net drawer drift across counted shifts. Null when nothing was counted. */
  netVariance: number | null
}

/** The strip above the directory: enough to know whether to keep reading. */
export function summarizeTeam(entries: readonly StaffDirectoryEntry[]): TeamStats {
  return entries.reduce<TeamStats>(
    (stats, entry) => ({
      headcount: stats.headcount + (entry.isFormer ? 0 : 1),
      onShift: stats.onShift + (entry.openShift ? 1 : 0),
      posSales: stats.posSales + entry.activity.posSales,
      posSalesTotal: Math.round((stats.posSalesTotal + entry.activity.posSalesTotal) * 100) / 100,
      ordersHandled: stats.ordersHandled + activityCount(entry.activity),
      cancelled: stats.cancelled + entry.activity.cancelled,
      workedMs: stats.workedMs + entry.shifts.workedMs,
      netVariance:
        entry.shifts.netVariance === null
          ? stats.netVariance
          : Math.round(((stats.netVariance ?? 0) + entry.shifts.netVariance) * 100) / 100,
    }),
    {
      headcount: 0,
      onShift: 0,
      posSales: 0,
      posSalesTotal: 0,
      ordersHandled: 0,
      cancelled: 0,
      workedMs: 0,
      netVariance: null,
    },
  )
}

export interface DayActivity {
  /** Manila calendar day, `YYYY-MM-DD`. */
  dayKey: string
  /** What they touched that day, newest first. */
  events: OrderStatusEvent[]
  /** Drawers they opened that day. */
  shifts: StaffShiftRecord[]
  posSales: number
  posSalesTotal: number
  confirmed: number
  confirmedTotal: number
  completed: number
  cancelled: number
  progressed: number
}

function emptyDay(dayKey: string): DayActivity {
  return {
    dayKey,
    events: [],
    shifts: [],
    posSales: 0,
    posSalesTotal: 0,
    confirmed: 0,
    confirmedTotal: 0,
    completed: 0,
    cancelled: 0,
    progressed: 0,
  }
}

function countEvent(day: DayActivity, event: OrderStatusEvent): DayActivity {
  const total = event.orderTotal ?? 0
  switch (classifyEvent(event)) {
    case 'pos_sale':
      return {
        ...day,
        posSales: day.posSales + 1,
        posSalesTotal: Math.round((day.posSalesTotal + total) * 100) / 100,
      }
    case 'confirmed':
      return {
        ...day,
        confirmed: day.confirmed + 1,
        confirmedTotal: Math.round((day.confirmedTotal + total) * 100) / 100,
      }
    case 'cancelled':
      return { ...day, cancelled: day.cancelled + 1 }
    case 'completed':
      return { ...day, completed: day.completed + 1 }
    case 'progressed':
      return { ...day, progressed: day.progressed + 1 }
  }
}

/**
 * One person's window, cut into days — newest day first, newest event first
 * within it. A day on which they only opened the drawer is still a day: being
 * on the floor is the fact the owner is checking.
 */
export function groupActivityByDay(
  events: readonly OrderStatusEvent[],
  shifts: readonly StaffShiftRecord[],
): DayActivity[] {
  const days = new Map<string, DayActivity>()

  for (const event of events) {
    const dayKey = toBusinessDayKey(event.occurredAt)
    const day = days.get(dayKey) ?? emptyDay(dayKey)
    days.set(dayKey, { ...countEvent(day, event), events: [...day.events, event] })
  }

  for (const shift of shifts) {
    const dayKey = toBusinessDayKey(shift.openedAt)
    const day = days.get(dayKey) ?? emptyDay(dayKey)
    days.set(dayKey, { ...day, shifts: [...day.shifts, shift] })
  }

  return [...days.values()]
    .map((day) => ({
      ...day,
      events: [...day.events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
      shifts: [...day.shifts].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt)),
    }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
}
