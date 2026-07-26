// Tab registry for the platform (superadmin) surface — the peer of
// lib/workspaces.ts, which does the same job for the merchant surface. Pure
// data plus lookups; app/(superadmin)/_layout.tsx renders from it.
//
// This surface is reachable only by a session whose app_users.role is
// 'superadmin'. Merchants, restricted staff and the read-only demo session
// never see it and are redirected out by the layout.

export interface SuperadminTab {
  /** Route name under app/(superadmin)/. */
  name: string;
  label: string;
  icon: string;
}

export const SUPERADMIN_TABS: readonly SuperadminTab[] = [
  { name: "dashboard", label: "Overview", icon: "⊞" },
  { name: "tenants", label: "Restaurants", icon: "▤" },
  { name: "settings", label: "Settings", icon: "⚙" },
] as const;

/** Tab names in display order. Readonly so `it.each` can iterate it. */
export const SUPERADMIN_TAB_NAMES = [
  "dashboard",
  "tenants",
  "settings",
] as const;

export function getSuperadminTab(name: string): SuperadminTab | undefined {
  return SUPERADMIN_TABS.find((t) => t.name === name);
}

export function isSuperadminTab(name: string): boolean {
  return getSuperadminTab(name) !== undefined;
}

/** Fully-substituted href (same contract as workspaces.defaultTabHref). */
export function superadminTabHref(name: string): string {
  return `/(superadmin)/${name}`;
}
