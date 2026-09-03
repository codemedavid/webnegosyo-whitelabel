/**
 * One answer to "can this account see this screen, and where?"
 *
 * The tab bar and the Menu hub both need the same four gates — the account's
 * staff grants, whether the store runs several branches, whether it takes
 * pre-orders, and which view is active — and a rule that lives in two places
 * drifts. `isTabReachable` is the account-level answer (the hub lists every
 * reachable screen); `isTabOnBar` adds the view gate the tab bar applies.
 *
 * Pure, so it runs under the node Jest project. The hooks that produce the
 * context (`usePortfolioAudience`, `useAdvanceOrdering`) stay in the callers.
 */

import { isBusinessTabVisible, type PortfolioAudience } from "./portfolio-landing";
import { isTabAllowed, type StaffPermissionHolder } from "./staff-permissions";
import { getWorkspace, isTabInWorkspace, type WorkspaceKey } from "./workspaces";

/** The always-visible hub tab; it belongs to no view. */
export const MENU_TAB = "menu";

/**
 * Screens registered to a view but kept off the tab bar. They are the
 * storefront's setup rather than a view of a shift, and a merchant reaches
 * them from the Menu hub. Keeping them registered preserves permissions and
 * the switcher's "what's in this view" list.
 */
export const SETUP_TABS: readonly string[] = ["payments"];

/** The Scheduled agenda only exists for a store that takes pre-orders. */
const ADVANCE_ORDER_TABS: readonly string[] = ["scheduled"];

export interface TabVisibilityContext {
  caller: StaffPermissionHolder;
  audience: PortfolioAudience;
  takesAdvanceOrders: boolean;
}

export function isTabReachable(tab: string, ctx: TabVisibilityContext): boolean {
  if (tab === MENU_TAB) return true;
  if (!isTabAllowed(ctx.caller, tab)) return false;
  if (!isBusinessTabVisible(tab, ctx.audience)) return false;
  if (ADVANCE_ORDER_TABS.includes(tab) && !ctx.takesAdvanceOrders) return false;
  return true;
}

export function isTabOnBar(
  tab: string,
  workspace: WorkspaceKey,
  ctx: TabVisibilityContext,
): boolean {
  if (tab === MENU_TAB) return true;
  if (SETUP_TABS.includes(tab)) return false;
  return isTabInWorkspace(tab, workspace) && isTabReachable(tab, ctx);
}

/** A view's reachable tabs, in registry order. Includes setup screens. */
export function reachableTabsOf(
  workspace: WorkspaceKey,
  ctx: TabVisibilityContext,
): string[] {
  return getWorkspace(workspace).tabs.filter((tab) => isTabReachable(tab, ctx));
}
