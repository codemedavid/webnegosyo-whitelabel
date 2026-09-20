/**
 * What the two hub tabs list, and in what order.
 *
 * Reports is everything the merchant reads; Manage is everything the merchant
 * sets up. Each is a short list of sections, each section a few screens. The
 * registry is pure data so the hub screens, the tutorial's simulated hubs and
 * the map-completeness test (`hubs.test.ts`) all read the same list — a screen
 * that is in the workspace registry but in no hub, under no parent and on no
 * bar slot is a screen nobody can reach, and that test is what catches it.
 */

import { isTabReachable, REPORT_TABS, SETUP_TABS, type TabVisibilityContext } from "./tab-visibility";

export interface HubSection {
  /** Sentence-case heading over the group. */
  title: string;
  /** Tab route names (app/(main)/*), in display order. */
  tabs: readonly string[];
}

export const REPORTS_SECTIONS: readonly HubSection[] = [
  // Trends hangs under Analytics (subscreen-links.ts) rather than sitting
  // beside it: it is the same sales, plotted over days.
  { title: "Sales", tabs: ["analytics", "growth"] },
  // The guest list and Rewards hang under the overview for the same reason.
  { title: "Customers", tabs: ["customer-hub"] },
  { title: "Products", tabs: ["product-analytics", "daily-report"] },
  { title: "Branches", tabs: ["branches"] },
];

export const MANAGE_SECTIONS: readonly HubSection[] = [
  { title: "Store", tabs: ["product-management", "categories", "inventory", "payments"] },
  // Shown only to an account that runs several branches: both screens are
  // gated on the branch count in tab-visibility, so the section simply
  // empties out for everyone else.
  { title: "Branches", tabs: ["portfolio", "branch-menu"] },
];

/** The sections an account may open, with unreachable rows and empty sections dropped. */
export function hubSections(
  sections: readonly HubSection[],
  ctx: TabVisibilityContext,
): HubSection[] {
  return sections
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((tab) => isTabReachable(tab, ctx)),
    }))
    .filter((section) => section.tabs.length > 0);
}

/** Every tab a hub lists, flat, for the completeness test. */
export function hubTabs(sections: readonly HubSection[]): string[] {
  return sections.flatMap((section) => [...section.tabs]);
}

/** The two hubs' flat contents must be exactly REPORT_TABS and SETUP_TABS. */
export const HUB_CONTENTS: Readonly<Record<"reports" | "manage", readonly string[]>> = {
  reports: REPORT_TABS,
  manage: SETUP_TABS,
};
