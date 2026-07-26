// Staff permission gating for the merchant app — ported from the web
// registry (src/lib/staff-permissions.ts). Keep the permission keys and
// tab mappings in sync with the web source of truth. Pure data + lookups.

import { WORKSPACES, type Workspace } from "./workspaces";

export type StaffPermissionKey =
  | "orders"
  | "menu"
  | "analytics"
  | "store_setup"
  | "customers"
  | "settings"
  | "pos";

export interface StaffPermissionHolder {
  role: string | null;
  isOwner: boolean;
  /** null = full access (owners and admins created before staff management). */
  permissions: string[] | null;
}

export function hasPermission(
  user: StaffPermissionHolder,
  key: StaffPermissionKey,
): boolean {
  if (user.role === "superadmin" || user.isOwner) return true;
  if (user.permissions == null) return true;
  return user.permissions.includes(key);
}

// Tab routes (app/(main)/*) mapped to the permission that gates them.
// Absent tabs (dashboard, account, detail screens) are open to all staff.
const TAB_PERMISSIONS: Record<string, StaffPermissionKey> = {
  orders: "orders",
  pos: "pos",
  "pos-sales": "pos",
  analytics: "analytics",
  growth: "analytics",
  trends: "analytics",
  "product-analytics": "analytics",
  "product-management": "menu",
};

export function isTabAllowed(user: StaffPermissionHolder, tab: string): boolean {
  const required = TAB_PERMISSIONS[tab];
  return required === undefined || hasPermission(user, required);
}

/**
 * Workspaces the user may see, with tabs filtered to permitted ones and
 * defaultTab repointed to the first surviving tab. Views with no
 * permitted tabs are dropped entirely.
 */
export function allowedWorkspaces(user: StaffPermissionHolder): Workspace[] {
  return WORKSPACES.reduce<Workspace[]>((kept, workspace) => {
    const tabs = workspace.tabs.filter((tab) => isTabAllowed(user, tab));
    if (tabs.length === 0) return kept;
    const defaultTab = tabs.includes(workspace.defaultTab)
      ? workspace.defaultTab
      : tabs[0];
    return [...kept, { ...workspace, tabs, defaultTab }];
  }, []);
}
