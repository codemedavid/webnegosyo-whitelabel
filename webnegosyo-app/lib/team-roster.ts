// Display registries for the Team screen: what each permission grant is
// called when an owner hands it out, and what each pinnable screen is called
// when they choose where a staff account opens. Pure data + lookups; the keys
// come from the shared registries (staff-permissions.ts, workspaces.ts) and
// team-roster.test.ts pins full coverage so a new key can never render blank.

import { IMPLIED_BY, STAFF_PERMISSION_KEYS, type StaffPermissionKey } from "./staff-permissions";
import { WORKSPACES } from "./workspaces";

export interface PermissionOption {
  key: StaffPermissionKey;
  label: string;
  description: string;
}

const PERMISSION_LABELS: Record<StaffPermissionKey, { label: string; description: string }> = {
  orders: {
    label: "Orders",
    description: "See the order queue and advance orders",
  },
  menu: {
    label: "Menu",
    description: "Edit products, prices, stock, and the daily report",
  },
  analytics: {
    label: "Analytics",
    description: "Sales figures, trends, and branch comparisons",
  },
  store_setup: {
    label: "Store Setup",
    description: "Payment methods and how the store gets paid",
  },
  customers: {
    label: "Customers",
    description: "The guest list and follow-up campaigns",
  },
  settings: {
    label: "Settings",
    description: "Store settings on the web admin",
  },
  pos: {
    label: "POS",
    description: "Ring up counter sales and reconcile the drawer",
  },
  branch_staff: {
    label: "Branch Staff",
    description: "Manage the staff of their own branch",
  },
  order_edit: {
    label: "Edit Orders",
    description: "Rewrite a placed order's items and totals",
  },
  order_refund: {
    label: "Refunds",
    description: "Move money back out of the drawer",
  },
  vouchers: {
    label: "Vouchers",
    description: "Create and manage discount vouchers",
  },
  loyalty_manage: {
    label: "Loyalty Programs",
    description: "Create and change reward programs and correct balances — grant sparingly",
  },
  loyalty_redeem: {
    label: "Redeem Rewards",
    description: "Apply a verified customer reward at the register, without seeing customer history",
  },
  kitchen: {
    label: "Kitchen Display",
    description: "The kitchen board — see tickets and bump orders",
  },
  tables: {
    label: "Tables",
    description: "The floor plan — seat parties, clear tables, see each table's bill",
  },
};

/** Every grantable permission, in registry order, labelled for the owner. */
export const PERMISSION_OPTIONS: readonly PermissionOption[] =
  STAFF_PERMISSION_KEYS.map((key) => ({ key, ...PERMISSION_LABELS[key] }));

/**
 * The name of the grant that already contains `key`, or null when the key
 * stands alone. The picker draws such a row on and locked while the parent is
 * held — a switch the owner can turn off while the screen stays reachable is a
 * lie about who can see what.
 */
export function containingGrantLabel(key: StaffPermissionKey): string | null {
  const parent = IMPLIED_BY[key];
  return parent === undefined ? null : PERMISSION_LABELS[parent].label;
}

export interface PinnableScreen {
  /** Route name under app/(main)/. */
  tab: string;
  label: string;
}

const SCREEN_LABELS: Record<string, string> = {
  dashboard: "Home",
  orders: "Orders",
  kitchen: "Kitchen Display",
  tables: "Tables",
  scheduled: "Scheduled Orders",
  pos: "POS",
  "pos-sales": "Drawer",
  analytics: "Analytics",
  growth: "Growth",
  customers: "Customers",
  trends: "Trends",
  "product-analytics": "Product Performance",
  "product-management": "Products",
  inventory: "Stock",
  "daily-report": "Daily Report",
  payments: "Payment Methods",
  portfolio: "Branches",
  branches: "Compare Branches",
  "branch-menu": "Branch Menu",
};

/**
 * Every screen an account can be pinned to, in tab-bar order. Falls back to
 * the route name for a tab added to the registry before it is named here —
 * the parity test fails on that, but the picker must not render blank rows in
 * the meantime.
 */
export const PINNABLE_SCREENS: readonly PinnableScreen[] = WORKSPACES.flatMap((w) =>
  w.tabs.map((tab) => ({ tab, label: SCREEN_LABELS[tab] ?? tab }))
);

const SUMMARY_LIMIT = 3;

/**
 * One line for a roster row: "Full access", or the first few grant labels
 * with a count for the rest. Unknown keys are dropped rather than rendered
 * blank — the server already refuses them, so one here is display-only drift.
 */
export function describePermissions(permissions: readonly string[] | null): string {
  if (permissions === null) return "Full access";
  const labels = permissions
    .map((key) => PERMISSION_LABELS[key as StaffPermissionKey]?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length <= SUMMARY_LIMIT) return labels.join(", ");
  const shown = labels.slice(0, SUMMARY_LIMIT).join(", ");
  return `${shown} +${labels.length - SUMMARY_LIMIT} more`;
}
