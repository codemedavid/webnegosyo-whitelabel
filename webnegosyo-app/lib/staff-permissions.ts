// Staff permission gating for the merchant app — ported from the web
// registry (src/lib/staff-permissions.ts). Keep the permission keys and
// tab mappings in sync with the web source of truth. Pure data + lookups.

import { WORKSPACES, type Workspace } from "./workspaces";

/**
 * The permission keys, as a runtime list so `staff-permissions-parity.test.ts`
 * on the web side can compare the two copies key by key. A union type alone
 * cannot be checked at runtime, and this registry drifting silently is exactly
 * the failure that test exists to catch.
 *
 * Order matches `src/lib/staff-permissions.ts` so the two files read the same.
 */
export const STAFF_PERMISSION_KEYS = [
  "orders",
  "menu",
  "analytics",
  "store_setup",
  "customers",
  "settings",
  "pos",
  // Managing staff for one's own branch only — held by a branch admin, who
  // must not be able to reach into another branch's roster.
  "branch_staff",
  // Rewriting a placed customer's bill, and moving money back out of the
  // drawer. Granted separately from "orders" (which only advances status) and
  // from each other, because a refund is the one action here that editing
  // again cannot undo.
  "order_edit",
  "order_refund",
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

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
  // Branch-versus-branch takings are store-wide revenue, so they ride the
  // analytics key. An unmapped tab defaults to allowed, which would have shown
  // every branch's revenue to a cashier with only the POS grant.
  branches: "analytics",
  // The portfolio is branch revenue side by side, so it rides the same key for
  // the same reason.
  portfolio: "analytics",
  // The roster is staff management: an owner holds it outright, a branch admin
  // through the grant that lets them run their own branch's people.
  team: "branch_staff",
  "product-management": "menu",
  // Deciding which branches carry a dish is a menu decision, so it rides the
  // menu key. An unmapped tab defaults to ALLOWED, which would let anyone with
  // only the POS grant take a dish off another branch's board.
  "branch-menu": "menu",
  // Reordering an ingredient is a menu decision, so it rides the same key.
  inventory: "menu",
  // The daily report is that same shelf, reconciled — whoever may see the
  // stock may see whether it added up. Mapping it at all is the point: an
  // unmapped tab defaults to ALLOWED, and this one names what went missing
  // and what it cost.
  "daily-report": "menu",
  // Where the store's money lands is store setup, not a shift task. An
  // unmapped tab defaults to allowed, which would let any cashier retire the
  // merchant's GCash account mid-service.
  payments: "store_setup",
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
