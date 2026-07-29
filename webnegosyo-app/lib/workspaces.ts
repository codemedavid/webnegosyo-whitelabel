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
    tabs: ["analytics", "growth", "trends"],
    defaultTab: "analytics",
  },
  {
    key: "products",
    label: "Products",
    description: "Menu performance, product management, and stock",
    // Inventory belongs beside the products it is spent on: the merchant who
    // 86s an item and the merchant who reorders its flour are the same person.
    tabs: ["product-analytics", "product-management", "inventory"],
    defaultTab: "product-analytics",
  },
  {
    key: "business",
    label: "Business",
    description: "Your branches, how they compare, and who runs them",
    // The roster ("team") joins these when its screen lands; a registered tab
    // with no route file breaks the tab bar for every account.
    tabs: ["portfolio", "branches"],
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
