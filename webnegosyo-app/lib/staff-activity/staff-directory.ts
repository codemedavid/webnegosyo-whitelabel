/**
 * The team as people, not as a list of events.
 *
 * `activity.ts` answers "what happened"; the Team screen asks "who is Ana".
 * That means one row per person carrying everything at once — what they rang
 * up, what they handled, whether their drawer is open right now, when they
 * were last seen — and, on their own screen, the same facts cut by day.
 *
 * Three decisions worth stating:
 *
 * - The owner is one of the people. They ring sales like anyone else, and a
 *   report that hides the busiest register is not a report.
 * - Someone removed from the roster keeps their history, flagged `isFormer`.
 *   Deleting an account must not rewrite last month's takings.
 * - Days are Manila days (`toBusinessDayKey`), the same boundary the database
 *   numbers orders by. A UTC cut would move the dinner rush to tomorrow.
 *
 * Mirrors `src/lib/staff-activity/staff-profile.ts` on the web.
 */

import { toBusinessDayKey } from "../daily-report/business-day";
import type { ShiftRecord } from "../shift-service";
import type { StaffMember } from "../staff-service";
import {
  EMPTY_ACTIVITY,
  classifyActivity,
  summarizeTeamActivity,
  type ActivitySummary,
  type ActivityWindow,
  type OrderActivityEvent,
} from "./activity";
import { EMPTY_SHIFT_TOTALS, summarizeShifts, type ShiftTotals } from "./shift-summary";

export const UNNAMED_ACCOUNT = "Unnamed account";

/** How an account is named wherever the staff surfaces print it. */
export function staffDisplayName(member: Pick<StaffMember, "displayName" | "email">): string {
  return member.displayName || member.email || UNNAMED_ACCOUNT;
}

/** Total acts in the window — how "busy" is ordered. */
export function activityCount(summary: ActivitySummary): number {
  return (
    summary.posSales + summary.confirmed + summary.cancelled + summary.completed + summary.progressed
  );
}

export interface StaffDirectoryEntry {
  userId: string;
  name: string;
  email: string | null;
  isOwner: boolean;
  /** No longer on the roster — kept so their history stays attributable. */
  isFormer: boolean;
  /** null = the whole store. */
  outletId: string | null;
  /** null = full access, as on `app_users`. */
  permissions: string[] | null;
  defaultTab: string | null;
  joinedAt: string | null;
  activity: ActivitySummary;
  shifts: ShiftTotals;
  /** The drawer they hold right now, if any. */
  openShift: ShiftRecord | null;
  /** Latest of any order they touched or any shift they opened or closed. */
  lastActiveAt: string | null;
}

export interface DirectoryInput {
  members: readonly StaffMember[];
  events: readonly OrderActivityEvent[];
  shifts: readonly ShiftRecord[];
  window: ActivityWindow;
  nowMs: number;
}

function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function lastEventAt(events: readonly OrderActivityEvent[], actorUserId: string, window: ActivityWindow): string | null {
  return events.reduce<string | null>((latest, event) => {
    if (event.actorUserId !== actorUserId) return latest;
    const at = Date.parse(event.occurredAt);
    if (at < window.startMs || at > window.endMs) return latest;
    return laterOf(latest, event.occurredAt);
  }, null);
}

function groupShiftsByStaff(shifts: readonly ShiftRecord[]): Map<string, ShiftRecord[]> {
  const grouped = new Map<string, ShiftRecord[]>();
  for (const shift of shifts) {
    if (!shift.staffUserId) continue;
    grouped.set(shift.staffUserId, [...(grouped.get(shift.staffUserId) ?? []), shift]);
  }
  return grouped;
}

function lastSeen(
  events: readonly OrderActivityEvent[],
  userId: string,
  window: ActivityWindow,
  shifts: readonly ShiftRecord[],
): string | null {
  return shifts.reduce<string | null>(
    (latest, shift) => laterOf(laterOf(latest, shift.openedAt), shift.closedAt),
    lastEventAt(events, userId, window),
  );
}

/**
 * On shift first — whoever is behind the counter right now is who the owner
 * opened this screen to find. Then busiest in the window, then most recently
 * seen, then alphabetically so the order is stable between refreshes.
 */
function compareEntries(a: StaffDirectoryEntry, b: StaffDirectoryEntry): number {
  if ((a.openShift !== null) !== (b.openShift !== null)) return a.openShift !== null ? -1 : 1;
  const byActivity = activityCount(b.activity) - activityCount(a.activity);
  if (byActivity !== 0) return byActivity;
  const bySeen = Date.parse(b.lastActiveAt ?? "0") - Date.parse(a.lastActiveAt ?? "0");
  if (!Number.isNaN(bySeen) && bySeen !== 0) return bySeen;
  return a.name.localeCompare(b.name);
}

/** One row per person: the roster, plus anyone whose history outlives them. */
export function buildStaffDirectory(input: DirectoryInput): StaffDirectoryEntry[] {
  const activityRows = new Map(
    summarizeTeamActivity(input.events, input.window).map((row) => [row.actorUserId, row]),
  );
  const shiftsByStaff = groupShiftsByStaff(input.shifts);

  const toEntry = (
    identity: Omit<StaffDirectoryEntry, "activity" | "shifts" | "openShift" | "lastActiveAt">,
    activity: ActivitySummary,
    shifts: readonly ShiftRecord[],
  ): StaffDirectoryEntry => ({
    ...identity,
    activity,
    shifts: shifts.length === 0 ? EMPTY_SHIFT_TOTALS : summarizeShifts(shifts, input.nowMs),
    openShift: shifts.find((shift) => shift.status === "open") ?? null,
    lastActiveAt: lastSeen(input.events, identity.userId, input.window, shifts),
  });

  const entries = input.members.map((member) =>
    toEntry(
      {
        userId: member.userId,
        name: staffDisplayName(member),
        email: member.email,
        isOwner: member.isOwner,
        isFormer: false,
        outletId: member.outletId,
        permissions: member.permissions,
        defaultTab: member.defaultTab,
        joinedAt: member.createdAt ?? null,
      },
      activityRows.get(member.userId)?.summary ?? EMPTY_ACTIVITY,
      shiftsByStaff.get(member.userId) ?? [],
    ),
  );

  const known = new Set(entries.map((entry) => entry.userId));
  const formerIds = [...activityRows.keys(), ...shiftsByStaff.keys()].filter(
    (userId) => !known.has(userId),
  );

  const former = [...new Set(formerIds)].map((userId) => {
    const shifts = shiftsByStaff.get(userId) ?? [];
    const row = activityRows.get(userId);
    return toEntry(
      {
        userId,
        name: row?.actorName ?? shifts[0]?.staffName ?? UNNAMED_ACCOUNT,
        email: null,
        isOwner: false,
        isFormer: true,
        outletId: shifts[0]?.outletId ?? null,
        permissions: [],
        defaultTab: null,
        joinedAt: null,
      },
      row?.summary ?? EMPTY_ACTIVITY,
      shifts,
    );
  });

  return [...entries, ...former].sort(compareEntries);
}

export interface TeamStats {
  /** People on the roster now. Former staff are history, not headcount. */
  headcount: number;
  onShift: number;
  posSales: number;
  posSalesTotal: number;
  /** Every act in the window, counter sales included. */
  ordersHandled: number;
  cancelled: number;
  workedMs: number;
  /** Net drawer drift across counted shifts. Null when nothing was counted. */
  netVariance: number | null;
}

/** The tiles above the directory: enough to know whether to keep reading. */
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
  );
}

export interface DayActivity {
  /** Manila calendar day, `YYYY-MM-DD`. */
  dayKey: string;
  /** What they touched that day, newest first. */
  events: OrderActivityEvent[];
  /** Drawers they opened that day. */
  shifts: ShiftRecord[];
  summary: ActivitySummary;
}

function countEvent(summary: ActivitySummary, event: OrderActivityEvent): ActivitySummary {
  const total = event.orderTotal ?? 0;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  switch (classifyActivity(event)) {
    case "pos_sale":
      return { ...summary, posSales: summary.posSales + 1, posSalesTotal: round2(summary.posSalesTotal + total) };
    case "confirmed":
      return { ...summary, confirmed: summary.confirmed + 1, confirmedTotal: round2(summary.confirmedTotal + total) };
    case "cancelled":
      return { ...summary, cancelled: summary.cancelled + 1 };
    case "completed":
      return { ...summary, completed: summary.completed + 1 };
    case "progressed":
      return { ...summary, progressed: summary.progressed + 1 };
  }
}

/**
 * One person's window, cut into days — newest day first, newest act first
 * within it. A day on which they only opened the drawer is still a day:
 * being on the floor is the fact the owner is checking.
 */
export function groupActivityByDay(
  events: readonly OrderActivityEvent[],
  shifts: readonly ShiftRecord[],
): DayActivity[] {
  const days = new Map<string, DayActivity>();
  const dayOf = (dayKey: string): DayActivity =>
    days.get(dayKey) ?? { dayKey, events: [], shifts: [], summary: EMPTY_ACTIVITY };

  for (const event of events) {
    const dayKey = toBusinessDayKey(event.occurredAt);
    const day = dayOf(dayKey);
    days.set(dayKey, {
      ...day,
      events: [...day.events, event],
      summary: countEvent(day.summary, event),
    });
  }

  for (const shift of shifts) {
    const dayKey = toBusinessDayKey(shift.openedAt);
    const day = dayOf(dayKey);
    days.set(dayKey, { ...day, shifts: [...day.shifts, shift] });
  }

  return [...days.values()]
    .map((day) => ({
      ...day,
      events: [...day.events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
      shifts: [...day.shifts].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt)),
    }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
}
