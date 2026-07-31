/**
 * Whether the phone may state the day's takings, and therefore a food cost.
 *
 * The app needs no backend router to read revenue: screens address their order
 * backend by string ref, so `orders:getDashboardStatsByPeriod` is served by
 * Convex or by the platform Supabase adapter without this module knowing which.
 * What it does know is when the answer must not be USED.
 *
 * THE SCOPE MISMATCH. `loadDailyReport` reads `stock_movements` store-wide,
 * while `useSafeQuery` narrows orders to the branch the ACCOUNT is confined to.
 * For a branch manager those two describe different businesses, and dividing one
 * by the other produces a food cost percentage inflated by roughly the number of
 * branches. It would not look like an error; it would look like a costing
 * emergency, and it would be entirely an artefact. Until the ledger read is
 * branch-aware, the only honest answer for such an account is silence.
 *
 * THE THREE STATES are the web panel's, deliberately, so both surfaces speak one
 * vocabulary:
 * - `undefined` — this caller does not deal in revenue. The card is absent.
 * - `null` — the takings are unknown. The card renders a reason.
 * - a number — the takings, including a real `0`.
 *
 * A read that FAILED is never revenue of ZERO. Zero is a flattering denominator:
 * it renders as "no sales were recorded", which is a confident claim about the
 * merchant's day made on the strength of a dropped connection.
 */

/** The shape of the dashboard stats query, narrowed to what is used here. */
export interface DailyRevenueStats {
  totalRevenue?: number;
}

export interface ReportRevenueInput {
  /** Whether the ACCOUNT is confined to one branch — not the owner's drill-down. */
  isBranchScoped: boolean;
  /** Whether the stats query is still in flight. */
  isLoading: boolean;
  /** The settled stats, or `undefined` when there are none. */
  stats: DailyRevenueStats | undefined;
}

/**
 * The day's takings as the report may state them, or a withholding state.
 *
 * Never throws: revenue is one card on a read-only report, and a tenant whose
 * order backend is unreachable must still get their stock figures.
 */
export function resolveReportRevenue({
  isBranchScoped,
  isLoading,
  stats,
}: ReportRevenueInput): number | null | undefined {
  // First, and ahead of the failure cases: "not comparable" outranks "not
  // readable". Telling a branch manager the sales could not be read implies the
  // figure would otherwise have been theirs to see.
  if (isBranchScoped) return undefined;

  // Nothing to say yet. `null` here would flash "sales could not be read" on
  // every cold mount, which is a lie about a query that is merely slow.
  if (isLoading) return undefined;

  const revenue = stats?.totalRevenue;

  // Covers a query that returned nothing, an older deployment answering without
  // the field, and a corrupt negative total. All three are "we cannot tell",
  // which is emphatically not "the day took nothing".
  if (typeof revenue !== "number" || !Number.isFinite(revenue) || revenue < 0) {
    return null;
  }

  return revenue;
}
