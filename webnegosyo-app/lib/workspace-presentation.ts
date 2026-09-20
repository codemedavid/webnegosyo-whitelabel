/**
 * How each section and screen presents itself: its icon, its short tab label,
 * and the one-line hint the hubs show under it.
 *
 * Kept apart from `workspaces.ts` (the pure routing registry) so the registry
 * never has to know that icons exist, and apart from the screens so the tab
 * bar, the hubs, the sub-screen doors and the tutorial all say the same thing
 * about a screen.
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
  // The bar
  dashboard: { label: "Home", icon: "dashboard", hint: "Today's takings and the live queue" },
  orders: { label: "Orders", icon: "orders", hint: "Every order — filter, advance, cancel" },
  pos: { label: "POS", icon: "register", hint: "Ring up a counter sale" },
  reports: { label: "Reports", icon: "trends", hint: "Sales, customers, products and branches" },
  menu: { label: "Manage", icon: "settings", hint: "Products, stock, payments, people and device" },
  // Under Orders
  kitchen: { label: "Kitchen", icon: "kitchen", hint: "Tickets for the pass" },
  tables: { label: "Tables", icon: "tables", hint: "Who is seated where, and what they ordered" },
  scheduled: { label: "Schedule", icon: "calendar", hint: "Pre-orders by requested time" },
  // Under POS
  "pos-sales": { label: "Drawer", icon: "drawer", hint: "Open or close your shift and count the till" },
  // Reports
  analytics: { label: "Analytics", icon: "analytics", hint: "Sales by type and payment method" },
  trends: { label: "Trends", icon: "trends", hint: "Daily revenue and order trends" },
  growth: { label: "Growth", icon: "growth", hint: "A growth plan built from your numbers" },
  "customer-hub": { label: "Customers", icon: "customers", hint: "Who comes back, and what they order" },
  customers: { label: "Guest list", icon: "customers", hint: "Every guest, and follow-up campaigns" },
  loyalty: { label: "Rewards", icon: "check", hint: "Stamp cards and points for regulars" },
  "product-analytics": { label: "Performance", icon: "performance", hint: "What sells, and what doesn't" },
  "daily-report": { label: "Stock report", icon: "report", hint: "Whether today's stock added up" },
  branches: { label: "Compare branches", icon: "compare", hint: "Branch against branch" },
  // Manage
  "product-management": { label: "Products", icon: "manage", hint: "Products, prices, availability" },
  categories: { label: "Categories", icon: "list", hint: "Menu sections, their order and icons" },
  inventory: { label: "Stock", icon: "stock", hint: "Ingredients, counts and transfers" },
  payments: { label: "Payments", icon: "payments", hint: "How customers pay you" },
  portfolio: { label: "Branches", icon: "storefront", hint: "Every branch at a glance — tap one to run it" },
  "branch-menu": { label: "Branch products", icon: "list", hint: "Which branch sells what" },
};

export function tabPresentation(tab: string): TabPresentation {
  return TAB_PRESENTATION[tab] ?? { label: tab, icon: "list", hint: "" };
}

export function tabLabel(tab: string): string {
  return tabPresentation(tab).label;
}
