/**
 * How staff facts are written on screen.
 *
 * Shared by the Team directory, a person's profile, the shift list and the
 * day history so "last active" never reads `5h ago` on one card and a raw
 * `toLocaleString()` on the next. Pure string work, `now` always passed in —
 * a formatter that reads the clock cannot be tested.
 *
 * Times are rendered on Manila's fixed +08:00 offset rather than the device's
 * locale, for the same reason `daily-report/business-day.ts` uses it: a shift
 * that started at 9am must not read as 1am because the phone is roaming, and
 * `Intl` month names change spelling between runtimes ("Sep" / "Sept").
 *
 * Mirrors `src/lib/staff-activity/staff-format.ts` on the web. Change both.
 */

import { previousBusinessDayKey, toBusinessDayKey } from "./daily-report/business-day";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past this, a relative gap stops meaning anything; give the date. */
const RELATIVE_CEILING_MS = 14 * DAY_MS;
const MANILA_OFFSET_MS = 8 * HOUR_MS;

/** `14 Sep 2026`, read on the merchant's day. */
function formatCalendarDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `Today`, `Yesterday`, or `Mon, 14 Sep 2026`. */
export function formatDayLabel(dayKey: string, nowIso: string): string {
  const todayKey = toBusinessDayKey(nowIso);
  if (dayKey === todayKey) return "Today";
  if (dayKey === previousBusinessDayKey(todayKey)) return "Yesterday";

  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${formatCalendarDate(date)}`;
}

/** `Just now` / `12m ago` / `5h ago` / `3d ago`, then a plain date. */
export function formatLastActive(iso: string | null, nowMs: number): string {
  if (!iso) return "No activity yet";

  const gap = nowMs - Date.parse(iso);
  if (Number.isNaN(gap)) return "No activity yet";
  if (gap < MINUTE_MS) return "Just now";
  if (gap < HOUR_MS) return `${Math.floor(gap / MINUTE_MS)}m ago`;
  if (gap < DAY_MS) return `${Math.floor(gap / HOUR_MS)}h ago`;
  if (gap < RELATIVE_CEILING_MS) return `${Math.floor(gap / DAY_MS)}d ago`;

  return formatCalendarDate(new Date(iso));
}

/** `9:12 AM`, on the merchant's clock. */
export function formatClock(iso: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return "—";

  const local = new Date(instant + MANILA_OFFSET_MS);
  const hours24 = local.getUTCHours();
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ${hours24 < 12 ? "AM" : "PM"}`;
}

/** `7h 20m`, or `45m` under the hour. Never an empty string. */
export function formatShiftLength(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

/**
 * Two letters for an avatar, from a name or, failing that, an email.
 *
 * An email is cut at the `@` first: `ana@example.com` is one person called
 * Ana, not "A E".
 */
export function initialsOf(name: string): string {
  const source = name.includes("@") ? name.slice(0, name.indexOf("@")) : name;
  const words = source.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
