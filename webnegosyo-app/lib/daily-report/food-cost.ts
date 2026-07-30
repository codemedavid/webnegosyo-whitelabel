/**
 * What the day's stock cost, as a share of what the day took.
 *
 * This is the question the whole report was asked for: "is the revenue today
 * enough for the inventory that has been deducted today?" Food cost percentage
 * is the standard way the trade asks it — roughly 25–35% for a restaurant,
 * higher for a low-margin menu — and it is only meaningful when both halves are
 * real.
 *
 * The one rule that matters here: **revenue that could not be READ is not
 * revenue of ZERO.** A tenant whose Convex deployment timed out, or whose order
 * database is unreachable, has an unknown food cost. Reporting that as 0% — or
 * as a percentage computed against a zero denominator — turns a broken read into
 * a flawless day, which is the most dangerous thing this report could do.
 * `null` in, `null` out.
 */

/**
 * The day's food cost as a percentage, or `null` when the question has no
 * answer.
 *
 * `null` means "not shown", and the caller must render a reason rather than a
 * number. The three ways to get it:
 * - `revenue` is `null` — the order backend could not be read.
 * - `revenue` is `0` — nothing was sold, so there is nothing to be a share of.
 * - `revenue` is negative — no backend models a negative day total, so the
 *   figure is wrong, and a wrong ratio is worse than an absent one.
 *
 * A zero or negative `cogs` is passed through rather than suppressed. Zero is a
 * real (and usually diagnostic) answer: it normally means no dish has a recipe.
 * Negative means the day voided more than it sold, which is a genuine anomaly
 * and must stay visible.
 */
export function resolveFoodCostPercent(cogs: number, revenue: number | null): number | null {
  if (revenue === null || revenue <= 0) return null

  return (cogs / revenue) * 100
}
