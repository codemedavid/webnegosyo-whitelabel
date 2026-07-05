// Workspace (view) registry for the merchant app. The app is split into three
// focused views — Operations, Insights, Products — and the tab bar only shows
// the tabs owned by the active view. Pure data + lookups; the active view
// lives in stores/workspace-store.ts and the tab bar reads both.

export type WorkspaceKey = "operations" | "insights" | "products";

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
    key: "insights",
    label: "Insights",
    description: "Sales analytics, growth, and trends",
    tabs: ["analytics", "growth", "trends"],
    defaultTab: "analytics",
  },
  {
    key: "products",
    label: "Products",
    description: "Menu performance and product management",
    tabs: ["product-analytics", "product-management"],
    defaultTab: "product-analytics",
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
