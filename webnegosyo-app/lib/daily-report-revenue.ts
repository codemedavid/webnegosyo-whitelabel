/**
 * Whether the phone may state the day's takings, and therefore a food cost.
 *
 * The app needs no backend router to read revenue: screens address their order
 * backend by string ref, so `orders:getDashboardStatsByPeriod` is served by
 * Convex or by the platform Supabase adapter without this module knowing which.
 * What it does know is when the answer must not be USED.
 *
 * THE SCOPE MISMATCH. Both halves must describe the same shop. `loadDailyReport`
 * now takes a branch, so the ledger half can. The takings half depends ENTIRELY
 * on the backend:
 *
 *  - **Platform Supabase** narrows `orders:getDashboardStatsByPeriod` through
 *    `scopeToBranch` in lib/backends/supabase-adapter.ts. Comparable.
 *  - **Convex** does not. That query takes `startDate` and `endDate` and nothing
 *    else, and the ref is deliberately absent from `CONVEX_BRANCH_SCOPED_REFS`
 *    because sending an unknown argument blanks the screen on any deployment
 *    below v15. Store-wide, whoever asks.
 *
 * So a branch manager on Convex would get a BRANCH numerator over STORE-WIDE
 * takings — a food cost far too LOW. That is the dangerous direction: an
 * inflated figure looks like a crisis and gets investigated, a flattering one
 * gets believed. Hence `isRevenueBranchScoped`, which the caller must establish
 * rather than assume: absent means "not established", never "assume yes".
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
  /**
   * Whether the backend actually narrowed the takings to that branch.
   *
   * Optional, and absent means NO. A caller that has not been taught this
   * distinction must not start publishing incomparable figures merely by not
   * mentioning it.
   */
  isRevenueBranchScoped?: boolean;
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
  isRevenueBranchScoped,
  isLoading,
  stats,
}: ReportRevenueInput): number | null | undefined {
  // First, and ahead of the failure cases: "not comparable" outranks "not
  // readable". Telling a branch manager the sales could not be read implies the
  // figure would otherwise have been theirs to see.
  if (isBranchScoped && !isRevenueBranchScoped) return undefined;

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
