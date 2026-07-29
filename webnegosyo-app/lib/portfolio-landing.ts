/**
 * Whether this account gets the branch portfolio, and where it lands.
 *
 * The four working views — Operations, Register, Insights, Products — are
 * views of a shift, and every account has had them since the app shipped.
 * Business is a view of the company, and it only makes sense for someone who
 * actually runs several branches.
 *
 * These predicates are the whole blast radius of that change. Every merchant
 * running one location, every branch manager, and every demo session must open
 * on exactly the screen they open on today; if that stops being true, it shows
 * up as "the app opens somewhere else now" for people who never asked for
 * branches. So the rule is stated once, tested from its negative cases first,
 * and read by both the landing redirect and the view switcher — a view offered
 * in the switcher but never landed on (or the reverse) would be its own bug.
 *
 * The branch count comes from a query, so `null` means "not known yet" and is
 * deliberately treated as single-location: opening the queue and staying there
 * beats flashing a portfolio and navigating away.
 */

import { canChooseBranch } from "./branch-context";
import type { BranchScope } from "./branch-scope";
import type { WorkspaceKey } from "./workspaces";

/**
 * Branches needed before the portfolio is worth showing. One branch is the
 * whole store: a portfolio of a single row would just be the dashboard with
 * fewer numbers.
 */
export const MIN_BRANCHES_FOR_PORTFOLIO = 2;

export interface PortfolioAudience {
  /** What the account may see, before any drill-down narrows it. */
  accountScope: BranchScope;
  /** Active branches this store has; null while the query is in flight. */
  activeOutletCount: number | null;
  isDemo?: boolean | null;
}

/**
 * Whether the Business view exists for this account.
 *
 * A branch account is excluded even though it could technically read a
 * one-row portfolio: the view is about choosing between branches, and a
 * manager has no choice to make.
 */
export function isPortfolioAvailable(audience: PortfolioAudience): boolean {
  if (audience.isDemo) return false;
  if (!canChooseBranch(audience.accountScope)) return false;

  const count = audience.activeOutletCount;
  return typeof count === "number" && count >= MIN_BRANCHES_FOR_PORTFOLIO;
}

/** The view to open on after sign-in. */
export function landingWorkspace(audience: PortfolioAudience): WorkspaceKey {
  return isPortfolioAvailable(audience) ? "business" : "operations";
}
