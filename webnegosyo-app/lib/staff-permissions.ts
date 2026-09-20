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
  // A standing discount on the merchant's own revenue. Kept off "menu" so
  // it is not handed to everyone who can rename a dish.
  "vouchers",
  // The kitchen display — sees every active ticket and bumps orders to ready.
  // Its own key (not "orders") so a cook's tablet can show the board without
  // also granting the full order queue, payments, and cancellations.
  "kitchen",
  // The floor plan — seats parties, clears tables, and shows each table's
  // open orders and bill. Its own key (not "orders") so a host stand can run
  // the floor without the full order queue, payments, and cancellations.
  "tables",
  // Loyalty programs: creating one, changing its rules, pausing it, and
  // correcting a customer's balance. Its own key rather than 'customers'
  // because a balance correction moves value, and 'vouchers' because a staffer
  // who may retire a promo code should not be able to rewrite every regular's
  // stamp card. Attaching a customer at the register needs no grant.
  "loyalty_manage",
  "loyalty_redeem",
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

export interface StaffPermissionHolder {
  role: string | null;
  isOwner: boolean;
  /** null = full access (owners and admins created before staff management). */
  permissions: string[] | null;
}

/**
 * Grants a broader grant already contains: key -> the grant that includes it.
 * Mirror of `IMPLIED_BY` in src/lib/staff-permissions.ts; the parity test
 * pins the two copies.
 *
 * A staff account's permission list is a snapshot of the keys that existed the
 * day it was written. So a key carved OUT of an existing grant takes its
 * screen away from every account already holding the parent — the merchant
 * ships a feature and their team silently cannot see it, with nothing on
 * screen to say why. `kitchen` and `tables` were both carved out of `orders`
 * for exactly that reason (see the registry comments above): the pass and the
 * floor are the live order queue seen from one station, minus the queue's
 * payments and cancellations. Anyone holding `orders` could already do strictly
 * more, so naming the containment here restores them without widening anyone.
 *
 * Only strict subsets belong here. A grant that can do something its parent
 * cannot — a refund, a loyalty balance, another person's account — is a
 * separate authority and stays opt-in, however adjacent it looks.
 */
export const IMPLIED_BY: Readonly<Partial<Record<StaffPermissionKey, StaffPermissionKey>>> = {
  kitchen: "orders",
  tables: "orders",
};

/** Whether `permissions` grants `key` outright or through its containing grant. */
function listGrants(permissions: readonly string[], key: StaffPermissionKey): boolean {
  if (permissions.includes(key)) return true;
  const parent = IMPLIED_BY[key];
  return parent !== undefined && permissions.includes(parent);
}

export function hasPermission(
  user: StaffPermissionHolder,
  key: StaffPermissionKey,
): boolean {
  if (user.role === "superadmin" || user.isOwner) return true;
  if (user.permissions == null) return true;
  return listGrants(user.permissions, key);
}

/** The keys `permissions` grants only by containment, for a picker to show as included. */
export function impliedPermissions(
  permissions: readonly string[] | null,
): StaffPermissionKey[] {
  if (permissions === null) return [];
  return (Object.keys(IMPLIED_BY) as StaffPermissionKey[]).filter(
    (key) => !permissions.includes(key) && permissions.includes(IMPLIED_BY[key] as string),
  );
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
  // The guest list is every customer's name and phone number, and the screen
  // can text all of them. An unmapped tab defaults to ALLOWED, which would
  // hand the store's contact database to whoever can ring up a sale.
  customers: "customers",
  // The Customer Hub is the same rows as the guest list, aggregated — repeat
  // rate, spend and favourites are derived from exactly the customer records
  // the `customers` key protects. Summarising PII does not declassify it, and
  // an unmapped tab defaults to ALLOWED.
  "customer-hub": "customers",
  "product-management": "menu",
  // Renaming, hiding or rearranging a section rewrites the public menu's
  // shape. An unmapped tab defaults to ALLOWED, which would let a cashier
  // empty the storefront's navigation mid-service.
  categories: "menu",
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
  // The kitchen board shows every active order and can advance them. An
  // unmapped tab defaults to ALLOWED, which would put the board — and its
  // bump button — in front of every staffer with any grant at all.
  kitchen: "kitchen",
  // The floor plan shows every seated party's bill and can clear a table.
  // Mapped explicitly because an unmapped tab defaults to ALLOWED.
  tables: "tables",
  // The scheduled agenda is the order queue re-sorted by requested time, so it
  // rides the orders grant. Mapped explicitly because an unmapped tab defaults
  // to ALLOWED, which would show every pre-order to a pos-only cashier.
  scheduled: "orders",
  // Program rules and balance corrections move value. Mapped explicitly
  // because an unmapped tab defaults to ALLOWED.
  loyalty: "loyalty_manage",
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
