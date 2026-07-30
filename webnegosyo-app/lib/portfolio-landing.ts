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
import { allowedWorkspaces, type StaffPermissionHolder } from "./staff-permissions";
import { workspaceForTab, type Workspace, type WorkspaceKey } from "./workspaces";

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

/**
 * The views this session may switch between.
 *
 * Two independent gates, composed: `allowedWorkspaces` asks what the staff
 * grants permit, and this adds what the account's branch permits. They have to
 * be composed rather than chosen between, because a branch manager is
 * `role='admin'` with full permissions by construction — the permission gate
 * alone says yes to Business, which is every other branch's takings.
 *
 * This is also the list the switcher sheet renders, so the same predicate that
 * decides the landing view decides what is offered. A view offered but never
 * landed on (or the reverse) would be its own bug.
 */
export function visibleWorkspaces(
  user: StaffPermissionHolder,
  audience: PortfolioAudience,
): Workspace[] {
  const permitted = allowedWorkspaces(user);
  if (isPortfolioAvailable(audience)) return permitted;
  return permitted.filter((workspace) => workspace.key !== "business");
}

/**
 * Whether a tab belonging to the Business view may be registered.
 *
 * The tab bar is a second door into the same screens: expo-router registers a
 * route whether or not the switcher ever named its view, so hiding the view
 * without hiding its tabs leaves the screens one tap away. Every non-Business
 * tab is left alone — this gate owns exactly one view.
 */
export function isBusinessTabVisible(tab: string, audience: PortfolioAudience): boolean {
  if (workspaceForTab(tab) !== "business") return true;
  return isPortfolioAvailable(audience);
}

/**
 * The view to actually render, given the one the session last selected.
 *
 * The selection is persisted, so it can outlive the right to see it: an owner
 * drills into Business and hands the device to a branch manager, or a store
 * drops back to one branch. Rendering the stored view anyway produces an empty
 * tab bar, which reads as a broken app rather than as a restriction — so an
 * unavailable view falls back to the first one this account does have.
 */
export function activeWorkspace(
  requested: WorkspaceKey,
  user: StaffPermissionHolder,
  audience: PortfolioAudience,
): WorkspaceKey {
  const visible = visibleWorkspaces(user, audience);
  if (visible.some((workspace) => workspace.key === requested)) return requested;
  return visible[0]?.key ?? "operations";
}
