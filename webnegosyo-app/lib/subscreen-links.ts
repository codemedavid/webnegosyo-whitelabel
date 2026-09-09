/**
 * Where a sub-screen is entered from.
 *
 * Three Insights screens were demoted off the tab bar (SUBSCREEN_TABS in
 * ./tab-visibility.ts). Demoting them without giving them a door would bury
 * them in the Menu hub, so each one names the screen it now hangs under, and
 * the parent renders those rows at the foot of itself.
 *
 * Pure data + a permission filter, so the tab bar's rules and the doors between
 * screens cannot disagree: a merchant who may not see Rewards is not offered a
 * row that refuses them, and a screen never invents a link to a tab the
 * registry does not own.
 */

import { isTabAllowed, type StaffPermissionHolder } from "./staff-permissions";
import { SUBSCREEN_TABS } from "./tab-visibility";
import { tabPresentation, type TabPresentation } from "./workspace-presentation";

/**
 * Parent tab → the sub-screens entered from it, in display order.
 *
 * Every value must be a SUBSCREEN_TAB and every key must be a tab that is
 * itself on the bar; `subscreen-links.test.ts` holds both ends.
 */
export const SUBSCREEN_PARENTS: Readonly<Record<string, readonly string[]>> = {
  // The same sales, plotted over days rather than sliced by type.
  analytics: ["trends"],
  // "Are they coming back?" is the question; who they are, and what keeps them
  // coming, are the two follow-ups.
  "customer-hub": ["customers", "loyalty"],
};

export interface SubscreenLink extends TabPresentation {
  /** Tab route name under app/(main). */
  tab: string;
  /** Fully-substituted href, same shape as defaultTabHref. */
  href: string;
}

/** True when this screen is entered from another screen rather than the bar. */
export function isSubscreen(tab: string): boolean {
  return SUBSCREEN_TABS.includes(tab);
}

/** The parent a sub-screen hangs under; undefined for a bar tab. */
export function parentOf(tab: string): string | undefined {
  return Object.keys(SUBSCREEN_PARENTS).find((parent) =>
    SUBSCREEN_PARENTS[parent].includes(tab),
  );
}

/**
 * The sub-screen rows `parent` should offer this account.
 *
 * Only staff grants are consulted: none of the sub-screens carries the
 * multi-branch or pre-order gate that `isTabReachable` additionally applies,
 * and the test file asserts that stays true.
 */
export function subscreensOf(
  parent: string,
  caller: StaffPermissionHolder,
): SubscreenLink[] {
  const tabs = SUBSCREEN_PARENTS[parent] ?? [];
  return tabs
    .filter((tab) => isTabAllowed(caller, tab))
    .map((tab) => ({ ...tabPresentation(tab), tab, href: `/(main)/${tab}` }));
}
