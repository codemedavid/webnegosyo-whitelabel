/**
 * Where a sub-screen is entered from.
 *
 * Seven screens hang under a bar tab instead of taking a slot of their own
 * (SUBSCREEN_TABS in ./tab-visibility.ts). Demoting them without giving them a
 * door would bury them, so each one names the screen it hangs under, and the
 * parent draws those doors — as header buttons for the shift screens (Orders
 * → Kitchen, Tables, Schedule; POS → Drawer), as rows at its foot for the reading
 * screens (Analytics → Trends; Customers → Guest list, Rewards).
 *
 * Pure data + the shared visibility gate, so the bar's rules and the doors
 * between screens cannot disagree: a merchant who may not see Rewards is not
 * offered a row that refuses them, a store that never takes pre-orders is not
 * offered a Schedule button, and a screen never invents a link to a tab the
 * registry does not own.
 */

import { isTabReachable, SUBSCREEN_TABS, type TabVisibilityContext } from "./tab-visibility";
import { tabPresentation, type TabPresentation } from "./workspace-presentation";

/**
 * Parent tab → the sub-screens entered from it, in display order.
 *
 * Every value must be a SUBSCREEN_TAB and every key a bar tab;
 * `subscreen-links.test.ts` holds both ends.
 */
export const SUBSCREEN_PARENTS: Readonly<Record<string, readonly string[]>> = {
  // The same live orders, for the pass and re-sorted by requested time.
  // The pass, the floor, and the same queue re-sorted by requested time.
  orders: ["kitchen", "tables", "scheduled"],
  // What the register took, beside the register.
  pos: ["pos-sales"],
  // The same sales, plotted over days rather than sliced by type.
  analytics: ["trends"],
  // "Are they coming back?" is the question; who they are, and what keeps them
  // coming, are the two follow-ups.
  "customer-hub": ["customers", "loyalty"],
};

export interface SubscreenLink extends TabPresentation {
  /** Tab route name under app/(main). */
  tab: string;
  /** Fully-substituted href (same contract as lib/navigation.ts productHref). */
  href: string;
}

/** The sub-screens this account may open from `parent`, in display order. */
export function subscreensOf(parent: string, ctx: TabVisibilityContext): SubscreenLink[] {
  const tabs = SUBSCREEN_PARENTS[parent] ?? [];
  return tabs
    .filter((tab) => isTabReachable(tab, ctx))
    .map((tab) => ({ tab, href: `/(main)/${tab}`, ...tabPresentation(tab) }));
}

/** The bar tab a sub-screen hangs under; undefined for anything else. */
export function parentOf(tab: string): string | undefined {
  return Object.keys(SUBSCREEN_PARENTS).find((parent) => SUBSCREEN_PARENTS[parent].includes(tab));
}

export function isSubscreen(tab: string): boolean {
  return SUBSCREEN_TABS.includes(tab);
}
