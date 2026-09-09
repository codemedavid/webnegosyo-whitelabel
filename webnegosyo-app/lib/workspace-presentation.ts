/**
 * How each view and screen presents itself: its icon, its short tab label, and
 * the one-line hint the Menu hub and the view switcher show under it.
 *
 * Kept apart from `workspaces.ts` (the pure routing registry) so the registry
 * never has to know that icons exist, and apart from the screens so the tab
 * bar, the switcher and the hub all say the same thing about a screen.
 */

import type { IconName } from "../components/Icon";
import type { WorkspaceKey } from "./workspaces";

export const WORKSPACE_ICONS: Record<WorkspaceKey, IconName> = {
  operations: "dashboard",
  register: "register",
  insights: "analytics",
  products: "stock",
  business: "storefront",
};

export interface TabPresentation {
  /** Short label for the tab bar and chips. */
  label: string;
  icon: IconName;
  /** What the merchant does there, in the product's own words. */
  hint: string;
}

const TAB_PRESENTATION: Record<string, TabPresentation> = {
  dashboard: { label: "Home", icon: "dashboard", hint: "Today's takings and the live queue" },
  orders: { label: "Orders", icon: "orders", hint: "Every order — filter, advance, cancel" },
  kitchen: { label: "Kitchen", icon: "kitchen", hint: "Tickets for the pass" },
  scheduled: { label: "Scheduled", icon: "calendar", hint: "Pre-orders by requested time" },
  pos: { label: "POS", icon: "register", hint: "Ring up a counter sale" },
  "pos-sales": { label: "Drawer", icon: "drawer", hint: "What the POS took today" },
  analytics: { label: "Analytics", icon: "analytics", hint: "Sales by type and payment method" },
  growth: { label: "Growth", icon: "growth", hint: "A growth plan built from your numbers" },
  // The overview IS the Customers tab now: the guest list and Rewards moved
  // under it (SUBSCREEN_TABS), so nothing else on the bar claims the word and
  // the tab no longer has to go by "Regulars" to avoid a clash.
  "customer-hub": { label: "Customers", icon: "customers", hint: "Who comes back, and what they order" },
  customers: { label: "Guest list", icon: "customers", hint: "Your guest list and follow-ups" },
  loyalty: { label: "Rewards", icon: "check", hint: "Stamp cards and points for regulars" },
  trends: { label: "Trends", icon: "trends", hint: "Daily revenue and order trends" },
  "product-analytics": { label: "Performance", icon: "performance", hint: "What sells, and what doesn't" },
  "product-management": { label: "Manage", icon: "manage", hint: "Products, prices, availability" },
  inventory: { label: "Stock", icon: "stock", hint: "Ingredients, counts and transfers" },
  "daily-report": { label: "Report", icon: "report", hint: "Whether today's stock added up" },
  payments: { label: "Payments", icon: "payments", hint: "How customers pay you" },
  portfolio: { label: "Branches", icon: "storefront", hint: "Every branch at a glance" },
  branches: { label: "Compare", icon: "compare", hint: "Branch against branch" },
  "branch-menu": { label: "Products", icon: "list", hint: "Which branch sells what" },
  menu: { label: "Menu", icon: "menu", hint: "Everything in the app" },
};

export function tabPresentation(tab: string): TabPresentation {
  return TAB_PRESENTATION[tab] ?? { label: tab, icon: "list", hint: "" };
}

export function tabLabel(tab: string): string {
  return tabPresentation(tab).label;
}
