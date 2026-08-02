/**
 * When a campaign becomes due.
 *
 * Everything here works in Asia/Manila local time, because that is the clock
 * the merchant set the campaign on and the clock the guest reads the message
 * in. The `sms/` reference app parsed dates as `YYYY-MM-DDT00:00:00Z` and did
 * day arithmetic in UTC; ported unchanged that puts a "10am" campaign at 6pm
 * Manila and a "late evening" campaign into the following day. Manila is UTC+8
 * year round and has never observed DST, so a fixed offset is exact rather
 * than an approximation.
 *
 * Quiet hours are applied last and are not optional. A marketing SMS at 2am is
 * how a merchant's personal SIM gets reported and blocked, which would take the
 * whole feature down with it.
 */

import type { NextDueContext, SmsCampaignSchedule } from "./types";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How far ahead to search for a matching weekday before giving up. */
const WEEKDAY_SEARCH_DAYS = 8;

export interface ManilaParts {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  /** ISO weekday: 1 = Monday .. 7 = Sunday. */
  weekday: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Read an instant on the Manila wall clock. */
export function toManilaParts(instant: Date): ManilaParts {
  const local = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
    // getUTCDay(): Sun=0..Sat=6 -> ISO Mon=1..Sun=7.
    weekday: ((local.getUTCDay() + 6) % 7) + 1,
  };
}

/** Minutes past local midnight for a "HH:MM" string; 0 for anything malformed. */
function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

/** The UTC instant of a Manila local date + time. */
function manilaInstant(date: string, time: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  return new Date(localMidnightUtc + minutesOfDay(time) * MS_PER_MINUTE - MANILA_OFFSET_MS);
}

/** The Manila date `days` after the given Manila date. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate()
  )}`;
}

/**
 * True when a local "HH:MM" falls inside the quiet window.
 *
 * The window normally wraps midnight (21:00 -> 08:00), so a plain `start <= t <
 * end` comparison is wrong for the common case. The start is inclusive and the
 * end exclusive, so a campaign set to exactly the reopening hour is allowed to
 * send rather than being pushed a further day.
 */
export function isWithinQuietHours(time: string, start: string, end: string): boolean {
  const current = minutesOfDay(time);
  const from = minutesOfDay(start);
  const until = minutesOfDay(end);

  if (from === until) return false; // Zero-width window: never quiet.
  if (from < until) return current >= from && current < until;
  return current >= from || current < until;
}

/** Hold a send that lands inside quiet hours until the window reopens. */
export function shiftOutOfQuietHours(due: Date, start: string, end: string): Date {
  const parts = toManilaParts(due);
  if (!isWithinQuietHours(parts.time, start, end)) return due;

  // Before the reopening hour on the same local day (e.g. 06:00 with an 08:00
  // reopen) it opens later today; otherwise the wrap means it opens tomorrow.
  const opensToday = minutesOfDay(parts.time) < minutesOfDay(end);
  const targetDate = opensToday ? parts.date : addDays(parts.date, 1);

  return manilaInstant(targetDate, end) ?? due;
}

/** The first daily occurrence of `time` strictly after `after`, in Manila. */
function nextDailyOccurrence(after: Date, time: string, notBefore?: string): Date | null {
  const parts = toManilaParts(after);
  const startDate =
    notBefore && notBefore > parts.date ? notBefore : parts.date;

  const sameDay = manilaInstant(startDate, time);
  if (sameDay && sameDay.getTime() > after.getTime()) return sameDay;

  return manilaInstant(addDays(startDate, 1), time);
}

function nextWeeklyOccurrence(
  after: Date,
  time: string,
  weekdays: readonly number[]
): Date | null {
  if (weekdays.length === 0) return null;
  const parts = toManilaParts(after);

  for (let offset = 0; offset < WEEKDAY_SEARCH_DAYS; offset += 1) {
    const date = addDays(parts.date, offset);
    const candidate = manilaInstant(date, time);
    if (!candidate || candidate.getTime() <= after.getTime()) continue;
    if (weekdays.includes(toManilaParts(candidate).weekday)) return candidate;
  }

  return null;
}

function nextIntervalOccurrence(
  schedule: SmsCampaignSchedule,
  context: NextDueContext
): Date | null {
  const interval = schedule.scheduleIntervalDays;
  if (!interval || interval <= 0) return null;

  const anchor = context.lastRunAt ?? context.createdAt;
  if (!anchor) return nextDailyOccurrence(context.after, schedule.scheduleTime);

  // Earliest local date the campaign may fire again.
  const earliestDate = addDays(toManilaParts(anchor).date, interval);
  return nextDailyOccurrence(context.after, schedule.scheduleTime, earliestDate);
}

/**
 * The next moment this campaign becomes due, or `null` when it never will.
 *
 * `null` is the safe answer for an under-specified schedule (a one-off with no
 * date, an interval campaign with no interval). The alternative — treating a
 * missing field as "now" — would fire a campaign on every poll.
 */
export function computeNextDueAt(
  schedule: SmsCampaignSchedule,
  context: NextDueContext
): Date | null {
  const raw = computeRawDueAt(schedule, context);
  if (!raw) return null;

  return shiftOutOfQuietHours(raw, schedule.quietHoursStart, schedule.quietHoursEnd);
}

function computeRawDueAt(
  schedule: SmsCampaignSchedule,
  context: NextDueContext
): Date | null {
  if (schedule.scheduleKind === "one_off") {
    if (!schedule.scheduleDate) return null;
    const due = manilaInstant(schedule.scheduleDate, schedule.scheduleTime);
    if (!due || due.getTime() <= context.after.getTime()) return null;
    return due;
  }

  if (schedule.scheduleKind === "every_n_days") {
    return nextIntervalOccurrence(schedule, context);
  }

  return nextWeeklyOccurrence(context.after, schedule.scheduleTime, schedule.scheduleWeekdays);
}
