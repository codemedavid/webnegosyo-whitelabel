/**
 * Whether this account gets the branch screens at all.
 *
 * Four of the five sections — Operations, Register, Insights, Products — are
 * views of a shift, and every account has had them since the app shipped.
 * Business is a view of the company, and it only makes sense for someone who
 * actually runs several branches.
 *
 * This predicate is the whole blast radius of that rule. It is read by the tab
 * bar, both hubs and the tutorial through `lib/tab-visibility.ts`, so a screen
 * offered in one place but withheld in another would be its own bug.
 *
 * The branch count comes from a query, so `null` means "not known yet" and is
 * deliberately treated as single-location: a section that is absent and then
 * appears beats one that flashes into view and out again.
 */

import { canChooseBranch } from "./branch-context";
import type { BranchScope } from "./branch-scope";
import { workspaceForTab } from "./workspaces";

/**
 * Branches needed before the portfolio is worth showing. One branch is the
 * whole store: a portfolio of a single row would just be Home with fewer
 * numbers.
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
 * Whether the Business screens exist for this account.
 *
 * A branch account is excluded even though it could technically read a
 * one-row portfolio: the screens are about choosing between branches, and a
 * manager has no choice to make.
 */
export function isPortfolioAvailable(audience: PortfolioAudience): boolean {
  if (audience.isDemo) return false;
  if (!canChooseBranch(audience.accountScope)) return false;

  const count = audience.activeOutletCount;
  return typeof count === "number" && count >= MIN_BRANCHES_FOR_PORTFOLIO;
}

/**
 * Whether a tab belonging to the Business section may be shown.
 *
 * Every non-Business tab is left alone — this gate owns exactly one section.
 * A branch manager is `role='admin'` with full permissions by construction, so
 * the permission gate alone says yes to every branch's takings; this is the
 * gate that says no.
 */
export function isBusinessTabVisible(tab: string, audience: PortfolioAudience): boolean {
  if (workspaceForTab(tab) !== "business") return true;
  return isPortfolioAvailable(audience);
}
