/**
 * The join between a native date/time picker and the strings a campaign stores.
 *
 * A picker hands back a `Date`. Everything downstream — `schedule.ts`,
 * `validateCampaignDraft`, the `sms_campaigns` columns — speaks `YYYY-MM-DD`
 * and `HH:MM`. Keeping that conversion here rather than in the screen is what
 * lets it be tested at all: the app's jest run covers pure-logic roots only.
 *
 * **Everything below reads and writes LOCAL clock fields, never UTC.** The
 * obvious one-liner, `toISOString().slice(0, 10)`, is wrong in Manila: local
 * midnight on the 5th is 16:00 on the 4th in UTC, so a campaign booked for
 * Saturday would be stored as Friday. `new Date("2026-08-05")` has the mirror
 * bug — it parses as UTC midnight, which is the 4th on this side of the world.
 * The date-part constructor (`new Date(y, m, d)`) is local by definition, which
 * is why it is used throughout.
 */

/** The instant within a day that a date field maps to. Noon, so that a DST */
/** shift in either direction cannot roll the date over. */
const SAFE_HOUR = 12;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` from a picker's Date, read off the local calendar. */
export function dateToDateField(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `HH:MM`, 24-hour, from a picker's Date, read off the local wall clock. */
export function dateToTimeField(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/**
 * A Date for the picker to open on, from a stored `YYYY-MM-DD`.
 *
 * Falls back rather than returning an Invalid Date: the field is a free string
 * in the draft and a half-typed value would otherwise crash the picker the
 * moment it opens.
 */
export function dateFieldToDate(value: string | null | undefined, fallback: Date): Date {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!parts) return fallback;

  // No Invalid-Date guard below: the regex has already established four digits,
  // two, and two, and the date-part constructor never returns NaN for finite
  // numbers — an impossible day like 2026-02-31 rolls forward into March rather
  // than failing. A guard here would be a branch no test could ever reach.
  const [, year, month, day] = parts;

  return new Date(Number(year), Number(month) - 1, Number(day), SAFE_HOUR);
}

/**
 * A Date for the picker to open on, from a stored `HH:MM`.
 *
 * The day carried by the returned Date is irrelevant and never read back — a
 * time picker only shows hours and minutes. Unreadable input opens at 00:00,
 * which is visibly wrong rather than silently plausible.
 */
export function timeFieldToDate(value: string | null | undefined): Date {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  const hours = parts ? Math.min(23, Number(parts[1])) : 0;
  const minutes = parts ? Math.min(59, Number(parts[2])) : 0;

  const base = new Date();
  base.setHours(hours, minutes, 0, 0);

  return base;
}
