/**
 * The two windows Home reads — today and yesterday — and the change between
 * them. Pure, so the arithmetic that puts a green or red pill on the takings
 * card can be tested without a clock or a backend.
 *
 * Local calendar days, deliberately: the merchant's day is the one on their
 * phone, and a UTC boundary would roll the figure over mid-evening in Manila.
 */

export interface DateRange {
  startDate: number;
  endDate: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

export function todayRange(now: Date): DateRange {
  const startDate = startOfDay(now);
  return { startDate, endDate: startDate + DAY_MS - 1 };
}

export function yesterdayRange(now: Date): DateRange {
  const todayStart = startOfDay(now);
  return { startDate: todayStart - DAY_MS, endDate: todayStart - 1 };
}

/**
 * Change from `previous` to `current` as a fraction (0.12 = up 12%).
 *
 * `null` when there is nothing to compare against — yesterday not loaded yet,
 * or a zero day, which would otherwise read as infinite growth.
 */
export function revenueDelta(
  current: number | undefined,
  previous: number | undefined,
): number | null {
  if (current === undefined || previous === undefined) return null;
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
