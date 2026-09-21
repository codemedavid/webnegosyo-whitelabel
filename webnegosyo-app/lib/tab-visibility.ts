/**
 * One answer to "can this account see this screen, and where?"
 *
 * The app used to be five "views", each swapping the tab bar for its own
 * tabs, with a chip in every header to switch between them. Four fifths of
 * the app was hidden behind that chip at any moment, and the bar changed shape
 * under the merchant's thumb. It is now one bar that never changes shape:
 *
 *   Home · Orders · POS · Reports · Manage
 *
 * Every other screen hangs under one of those five — as a sub-screen entered
 * from its parent (`lib/subscreen-links.ts`), or as a row in the Reports or
 * Manage hub (`lib/hubs.ts`). The three gates an account carries — its staff
 * grants, whether the store runs several branches, whether it takes
 * pre-orders — are asked here, once, and the bar, the hubs, the sub-screen
 * doors and the tutorial all read the same answer.
 *
 * Pure, so it runs under the node Jest project. The hooks that produce the
 * context (`usePortfolioAudience`, `useAdvanceOrdering`) stay in the callers.
 */

import { isBusinessTabVisible, type PortfolioAudience } from "./portfolio-landing";
import { isTabAllowed, type StaffPermissionHolder } from "./staff-permissions";
import { getWorkspace, type WorkspaceKey } from "./workspaces";

/** The hub of everything the merchant sets up: products, stock, payments, people, device, account. */
export const MENU_TAB = "menu";
/** The hub of everything the merchant reads: sales, customers, products, branches. */
export const REPORTS_TAB = "reports";
/** Hub tabs belong to no view; each lists other screens. */
export const HUB_TABS: readonly string[] = [REPORTS_TAB, MENU_TAB];

/**
 * The bar, left to right. Each slot names its candidates in order and the
 * first reachable one takes the slot, so the bar keeps its five positions for
 * every account: a cook whose only grant is the kitchen board sees it where
 * everyone else sees Orders, instead of a bar with a hole in it.
 */
export const BAR_SLOTS: readonly (readonly string[])[] = [
  ["dashboard"],
  ["orders", "kitchen"],
  ["pos"],
  [REPORTS_TAB],
  [MENU_TAB],
];

/**
 * Screens that belong UNDER a bar tab rather than beside it, entered from
 * their parent (see `lib/subscreen-links.ts`). Kitchen is the one exception
 * that can also take a bar slot, when the account cannot reach Orders.
 */
export const SUBSCREEN_TABS: readonly string[] = [
  "kitchen",
  "tables",
  "scheduled",
  "pos-sales",
  "trends",
  "customers",
  "loyalty",
];

/**
 * Screens the merchant reads, listed in the Reports hub. Order matters only
 * within `lib/hubs.ts`, which groups them; this flat list is what decides
 * whether the Reports tab exists for an account at all.
 */
export const REPORT_TABS: readonly string[] = [
  "analytics",
  "growth",
  "customer-hub",
  "product-analytics",
  "daily-report",
  "branches",
];

/** Screens the merchant sets up, listed in the Manage hub. */
export const SETUP_TABS: readonly string[] = [
  "product-management",
  "categories",
  "inventory",
  "payments",
  "portfolio",
  "branch-menu",
];

/** The Scheduled agenda only exists for a store that takes pre-orders. */
const ADVANCE_ORDER_TABS: readonly string[] = ["scheduled"];

/**
 * The floor plan carries no config gate of its own: it is reachable for any
 * account holding `tables` (which `orders` contains), in every store.
 *
 * It was once hidden unless the tenant had an ENABLED order type of kind
 * dine_in. That asked the online menu a question only the room can answer —
 * a restaurant that lists delivery and Grab on the web still seats people —
 * and the stores it got wrong had no door, so no way to draw a first table.
 * A shop that never draws one sees an empty floor, the same way a shop with
 * no products sees an empty menu.
 */
export interface TabVisibilityContext {
  caller: StaffPermissionHolder;
  audience: PortfolioAudience;
  takesAdvanceOrders: boolean;
}

export function isTabReachable(tab: string, ctx: TabVisibilityContext): boolean {
  if (tab === MENU_TAB) return true;
  // A hub with nothing in it is not a screen; the tab exists exactly when at
  // least one report does.
  if (tab === REPORTS_TAB) return REPORT_TABS.some((report) => isTabReachable(report, ctx));
  if (!isTabAllowed(ctx.caller, tab)) return false;
  if (!isBusinessTabVisible(tab, ctx.audience)) return false;
  if (ADVANCE_ORDER_TABS.includes(tab) && !ctx.takesAdvanceOrders) return false;
  return true;
}

/** The tabs on the bar for this account, left to right. */
export function barTabs(ctx: TabVisibilityContext): string[] {
  return BAR_SLOTS.flatMap((slot) => {
    const taken = slot.find((tab) => isTabReachable(tab, ctx));
    return taken === undefined ? [] : [taken];
  });
}

export function isTabOnBar(tab: string, ctx: TabVisibilityContext): boolean {
  return barTabs(ctx).includes(tab);
}

/** A view's reachable tabs, in registry order. Includes off-bar screens. */
export function reachableTabsOf(
  workspace: WorkspaceKey,
  ctx: TabVisibilityContext,
): string[] {
  return getWorkspace(workspace).tabs.filter((tab) => isTabReachable(tab, ctx));
}
