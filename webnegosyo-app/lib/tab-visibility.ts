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

/**
 * Screens that belong UNDER another screen rather than beside it.
 *
 * Insights had grown to six tabs and, with the always-on Menu hub, a
 * seven-item bar: every label truncated ("Analyti…", "Guest l…") and the
 * merchant had to read three tabs to answer one question. Three of those six
 * are not peers of the screen they sit next to — Trends plots the same sales
 * Analytics slices, and the guest list and the reward scheme are both things
 * you look at *after* the Customers overview tells you regulars are or are not
 * coming back. So they are entered from their parent (see
 * `lib/subscreen-links.ts`) instead of costing a slot on the bar.
 *
 * They stay registered tabs: permissions, the Menu hub and deep links are all
 * unchanged, exactly as for the setup screens above.
 */
export const SUBSCREEN_TABS: readonly string[] = ["trends", "customers", "loyalty"];

/** Every reachable-but-not-a-tab screen, whatever the reason it is off the bar. */
export const OFF_BAR_TABS: readonly string[] = [...SETUP_TABS, ...SUBSCREEN_TABS];

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
  if (OFF_BAR_TABS.includes(tab)) return false;
  return isTabInWorkspace(tab, workspace) && isTabReachable(tab, ctx);
}

/** A view's reachable tabs, in registry order. Includes off-bar screens. */
export function reachableTabsOf(
  workspace: WorkspaceKey,
  ctx: TabVisibilityContext,
): string[] {
  return getWorkspace(workspace).tabs.filter((tab) => isTabReachable(tab, ctx));
}
