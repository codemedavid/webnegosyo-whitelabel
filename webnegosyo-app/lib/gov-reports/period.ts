/**
 * The days a Senior/PWD report covers, in Manila time.
 *
 * Whole calendar days, never a rolling window: the sales book is kept per day
 * and per month, and an accountant asks for "October", not "the last 30
 * days". The Philippines has no daylight saving, so Manila is always UTC+8.
 * Same windows as the web report (`src/lib/gov-discount-reports/period.ts`).
 *
 * The window is half-open: `startIso` ≤ occurred_at < `endIso`.
 */

export const GOV_REPORT_PERIODS = ["today", "week", "month", "last_month"] as const;
export type GovReportPeriodKey = (typeof GOV_REPORT_PERIODS)[number];

export const GOV_REPORT_PERIOD_LABELS: Readonly<Record<GovReportPeriodKey, string>> = {
  today: "Today",
  week: "This week",
  month: "This month",
  last_month: "Last month",
};

export const DEFAULT_GOV_REPORT_PERIOD: GovReportPeriodKey = "month";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface GovReportPeriod {
  key: GovReportPeriodKey;
  /** First Manila day covered, `YYYY-MM-DD`. */
  fromDay: string;
  /** Last Manila day covered (inclusive), `YYYY-MM-DD`. */
  toDay: string;
  startIso: string;
  endIso: string;
  /** "October 2026", "Oct 6 – 12, 2026", "Today · Oct 12, 2026". */
  label: string;
}

interface DayParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

/** The Manila calendar day an instant falls on, `YYYY-MM-DD`. */
export function manilaDayKey(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function partsOf(dayKey: string): DayParts {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

function shortDay(parts: DayParts): string {
  return `${MONTH_NAMES[parts.month - 1].slice(0, 3)} ${parts.day}`;
}

/** "Oct 6 – 12, 2026", "Sep 28 – Oct 4, 2026", "Dec 29, 2025 – Jan 4, 2026". */
export function rangeLabel(fromDay: string, toDay: string): string {
  const from = partsOf(fromDay);
  const to = partsOf(toDay);
  if (fromDay === toDay) return `${shortDay(from)}, ${from.year}`;
  if (from.year !== to.year) return `${shortDay(from)}, ${from.year} – ${shortDay(to)}, ${to.year}`;
  const end = from.month === to.month ? String(to.day) : shortDay(to);
  return `${shortDay(from)} – ${end}, ${to.year}`;
}

function windowOf(key: GovReportPeriodKey, startMs: number, endMs: number, label: string): GovReportPeriod {
  return {
    key,
    fromDay: manilaDayKey(startMs),
    toDay: manilaDayKey(endMs - 1),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    label,
  };
}

/** A calendar month; `month` may be 0 (December of the year before). */
function monthWindow(key: GovReportPeriodKey, year: number, month: number): GovReportPeriod {
  const startMs = Date.UTC(year, month - 1, 1) - MANILA_OFFSET_MS;
  const endMs = Date.UTC(year, month, 1) - MANILA_OFFSET_MS;
  const normalised = new Date(Date.UTC(year, month - 1, 1));
  const label = `${MONTH_NAMES[normalised.getUTCMonth()]} ${normalised.getUTCFullYear()}`;
  return windowOf(key, startMs, endMs, label);
}

export function isGovReportPeriodKey(value: unknown): value is GovReportPeriodKey {
  return typeof value === "string" && (GOV_REPORT_PERIODS as readonly string[]).includes(value);
}

/** The window a period names, as of `nowMs`. Weeks start on Monday. */
export function resolveGovReportPeriod(key: GovReportPeriodKey, nowMs: number): GovReportPeriod {
  const todayKey = manilaDayKey(nowMs);
  const today = partsOf(todayKey);
  const todayStart = Date.UTC(today.year, today.month - 1, today.day) - MANILA_OFFSET_MS;

  switch (key) {
    case "today":
      return windowOf("today", todayStart, todayStart + DAY_MS, `Today · ${rangeLabel(todayKey, todayKey)}`);
    case "week": {
      const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
      const daysSinceMonday = (weekday + 6) % DAYS_PER_WEEK;
      const startMs = todayStart - daysSinceMonday * DAY_MS;
      const endMs = startMs + DAYS_PER_WEEK * DAY_MS;
      return windowOf("week", startMs, endMs, rangeLabel(manilaDayKey(startMs), manilaDayKey(endMs - 1)));
    }
    case "last_month":
      return monthWindow("last_month", today.year, today.month - 1);
    case "month":
    default:
      return monthWindow("month", today.year, today.month);
  }
}
