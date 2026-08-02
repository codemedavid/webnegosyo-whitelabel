// Workspace (view) registry for the merchant app. The app is split into five
// focused views — Operations, Register, Insights, Products, Business — and the
// tab bar only shows the tabs owned by the active view. Pure data + lookups;
// the active view lives in stores/workspace-store.ts and the tab bar reads both.
//
// Business is the odd one out: the other four are views of a shift, and every
// account has them. Business is the view of the company — which branches exist,
// how they compare, who runs them — so it is shown only to an account that
// actually runs several branches. That rule needs the branch count, which the
// registry has no way to know, so it lives in portfolio-landing.ts.

export type WorkspaceKey =
  | "operations"
  | "register"
  | "insights"
  | "products"
  | "business";

export interface Workspace {
  key: WorkspaceKey;
  label: string;
  description: string;
  /** Tab route names (app/(main)/*) owned by this view, in display order. */
  tabs: readonly string[];
  /** Route name to land on when switching into this view. */
  defaultTab: string;
}

export const WORKSPACES: readonly Workspace[] = [
  {
    key: "operations",
    label: "Operations",
    description: "Live orders and the day-to-day queue",
    tabs: ["dashboard", "orders"],
    defaultTab: "dashboard",
  },
  {
    key: "register",
    label: "Register",
    description: "Ring up counter sales and reconcile the drawer",
    tabs: ["pos", "pos-sales"],
    defaultTab: "pos",
  },
  {
    key: "insights",
    label: "Insights",
    description: "Sales analytics, growth, and trends",
    // Customers sits beside Growth rather than in Products: the guest list is
    // an audience to grow, not a thing on the shelf, and the follow-up
    // campaigns launched from it are the acquisition lever the Growth tab
    // spends its time telling the merchant to pull.
    tabs: ["analytics", "growth", "customers", "trends"],
    defaultTab: "analytics",
  },
  {
    key: "products",
    label: "Products",
    description: "Menu performance, product management, and stock",
    // Inventory belongs beside the products it is spent on: the merchant who
    // 86s an item and the merchant who reorders its flour are the same person.
    // How the merchant gets paid sits beside what they sell: both are the
    // storefront's setup, and neither is a view of a shift.
    // The daily report sits next to the shelf it reconciles rather than in
    // Insights: it carries no revenue on the phone, and the merchant who
    // counts the flour and the one asking whether the count matched are the
    // same person standing in the same place.
    tabs: [
      "product-analytics",
      "product-management",
      "inventory",
      "daily-report",
      "payments",
    ],
    defaultTab: "product-analytics",
  },
  {
    key: "business",
    label: "Business",
    description: "Your branches, how they compare, and who runs them",
    // The roster ("team") joins these when its screen lands; a registered tab
    // with no route file breaks the tab bar for every account.
    // The cross-branch menu belongs here rather than beside the store-wide
    // product list: it is a decision about which branch sells what, which only
    // exists for an account that runs several, and the Business view is the one
    // place already gated on exactly that.
    tabs: ["portfolio", "branches", "branch-menu"],
    defaultTab: "portfolio",
  },
] as const;

/** Workspace for a key; unknown keys fall back to Operations. */
export function getWorkspace(key: string): Workspace {
  return WORKSPACES.find((w) => w.key === key) ?? WORKSPACES[0];
}

export function isTabInWorkspace(tab: string, key: WorkspaceKey): boolean {
  return getWorkspace(key).tabs.includes(tab);
}

/** Owning workspace of a tab; undefined for detail/utility screens. */
export function workspaceForTab(tab: string): WorkspaceKey | undefined {
  return WORKSPACES.find((w) => w.tabs.includes(tab))?.key;
}

/** Fully-substituted href (same contract as lib/navigation.ts productHref). */
export function defaultTabHref(key: WorkspaceKey): string {
  return `/(main)/${getWorkspace(key).defaultTab}`;
}
