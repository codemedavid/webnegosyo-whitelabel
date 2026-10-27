// Day-boundary helpers for analytics/trends.
//
// The Convex runtime always executes in UTC, but merchants operate in their
// local timezone (default: Philippines / Asia/Manila, UTC+8, no DST). Any
// "per-day" bucketing, date key, or "today" boundary MUST use the merchant's
// local day — otherwise revenue is attributed to the wrong calendar date and
// "today" is shifted by the offset (~8h for PH), so the first hours of the
// local day get dropped or double-counted.
//
// offsetMs is parameterised so a per-tenant timezone (e.g. from tenantConfig)
// can be threaded through later; for now every caller uses the PH default.

/** Default UTC offset: Philippines (Asia/Manila) is a fixed UTC+8. */
export const DEFAULT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms of 00:00 local time for the local day containing `atMs`. */
export function localDayStartMs(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  const dayStartShifted = Math.floor((atMs + offsetMs) / DAY_MS) * DAY_MS;
  return dayStartShifted - offsetMs;
}

/** Local-day date key "YYYY-MM-DD" for an epoch ms instant. */
export function localDateKey(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  return new Date(atMs + offsetMs).toISOString().split("T")[0];
}

/** Local day-of-week (0=Sun..6=Sat) for an epoch ms instant. */
export function localDayOfWeek(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return new Date(atMs + offsetMs).getUTCDay();
}

/** Local hour (0..23) for an epoch ms instant. */
export function localHour(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return new Date(atMs + offsetMs).getUTCHours();
}

// --- Business day (the store's cutoff) ---------------------------------------
//
// A store may end its business day after midnight (e.g. 4:00 AM), so a 1 AM
// sale counts toward the night before. The schedule is EFFECTIVE-DATED: each
// change applies from a future day, so past days never move. No rows = Manila
// midnight, exactly `localDateKey` / `localDayStartMs` above.
//
// This is the Convex copy of the web/app engine (`src/lib/business-day/
// trading-day.ts`) and the SQL `business_day_of` (migration
// 20261027120000). `tests/unit/business-day/convex-time.property.test.ts`
// pins the three to the same answer. The schedule reaches the deployment as
// the `business_day_cutoffs` tenantConfig row (JSON), pushed by the web app's
// config sync.

/** The tenantConfig key the web app syncs the schedule into. */
export const BUSINESS_DAY_CUTOFFS_CONFIG_KEY = "business_day_cutoffs";

export interface CutoffChange {
  /** First business day (YYYY-MM-DD) that starts at this cutoff. */
  effectiveFrom: string;
  /** Minutes after local midnight, 0..705 in 15-minute steps. */
  cutoffMinutes: number;
}

const MAX_CUTOFF_MINUTES = 705;
const CUTOFF_STEP_MINUTES = 15;
const MINUTE_MS = 60 * 1000;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCutoffChange(row: unknown): row is CutoffChange {
  if (typeof row !== "object" || row === null) return false;
  const { effectiveFrom, cutoffMinutes } = row as Record<string, unknown>;
  return (
    typeof effectiveFrom === "string" &&
    DAY_KEY_PATTERN.test(effectiveFrom) &&
    typeof cutoffMinutes === "number" &&
    Number.isInteger(cutoffMinutes) &&
    cutoffMinutes >= 0 &&
    cutoffMinutes <= MAX_CUTOFF_MINUTES &&
    cutoffMinutes % CUTOFF_STEP_MINUTES === 0
  );
}

/**
 * The schedule from its tenantConfig value. Absent or malformed = midnight:
 * a deployment must keep numbering orders whatever arrived, and midnight is
 * what it did before the cutoff existed (the web sync validates before it
 * pushes, so a bad value here means an old or hand-edited row).
 */
export function parseCutoffConfig(value: string | null | undefined): CutoffChange[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isCutoffChange)) return [];
    return [...parsed].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  } catch {
    return [];
  }
}

/** The cutoff for the business day that STARTS on `dayKey` (0 before the first row). */
export function cutoffMinutesFor(schedule: readonly CutoffChange[], dayKey: string): number {
  let minutes = 0;
  let latest = "";
  for (const change of schedule) {
    if (change.effectiveFrom <= dayKey && change.effectiveFrom > latest) {
      latest = change.effectiveFrom;
      minutes = change.cutoffMinutes;
    }
  }
  return minutes;
}

function dayKeyStartMs(dayKey: string, schedule: readonly CutoffChange[], offsetMs: number): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - offsetMs + cutoffMinutesFor(schedule, dayKey) * MINUTE_MS;
}

/**
 * The business day ("YYYY-MM-DD") an instant belongs to. A cutoff is at most
 * 11:45, so an instant on local date c is in day c or c − 1.
 */
export function businessDayKey(
  atMs: number,
  schedule: readonly CutoffChange[],
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  const calendarDay = localDateKey(atMs, offsetMs);
  if (atMs >= dayKeyStartMs(calendarDay, schedule, offsetMs)) return calendarDay;
  return localDateKey(localDayStartMs(atMs, offsetMs) - 1, offsetMs);
}

/** Epoch ms at which the business day containing `atMs` starts. */
export function businessDayStartMs(
  atMs: number,
  schedule: readonly CutoffChange[],
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return dayKeyStartMs(businessDayKey(atMs, schedule, offsetMs), schedule, offsetMs);
}

export interface BusinessDayWindow {
  dayKey: string;
  /** Inclusive. */
  startMs: number;
  /** EXCLUSIVE. Not always start + 24 h (the day a cutoff changes). */
  endMs: number;
}

/** The business day that ended most recently before `nowMs` (yesterday's). */
export function previousBusinessDayWindow(
  nowMs: number,
  schedule: readonly CutoffChange[],
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): BusinessDayWindow {
  const todayStart = businessDayStartMs(nowMs, schedule, offsetMs);
  const dayKey = businessDayKey(todayStart - 1, schedule, offsetMs);
  return { dayKey, startMs: dayKeyStartMs(dayKey, schedule, offsetMs), endMs: todayStart };
}
