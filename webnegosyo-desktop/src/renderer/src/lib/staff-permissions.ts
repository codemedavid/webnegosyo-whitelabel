// Staff permission gating for the desktop POS — ported from the web
// registry (src/lib/staff-permissions.ts in the platform repo). Keep the
// permission keys in sync with that source of truth.

// Declared as an array, not a bare union, so the platform repo's parity test
// can import and compare it. As a union it was unreachable from that test,
// which is how this copy silently fell behind by a whole key ('branch_staff').
export const STAFF_PERMISSION_KEYS = [
  'orders',
  'menu',
  'analytics',
  'store_setup',
  'customers',
  'settings',
  'pos',
  // Managing staff for one's own branch only — held by a branch admin, who
  // must not be able to reach into another branch's roster.
  'branch_staff',
  // Rewriting a placed customer's bill, and moving money back out of the
  // drawer. Granted separately from 'orders' (which only advances status).
  'order_edit',
  'order_refund',
  // A standing discount on the merchant's own revenue. Kept off 'menu' so
  // it is not handed to everyone who can rename a dish.
  'vouchers',
  // The kitchen display — sees every active ticket and bumps orders to ready.
  'kitchen',
  // The floor plan — seat parties, clear tables, see each table's bill.
  'tables',
  // Loyalty programs: creating one, changing its rules, pausing it, and
  // correcting a customer's balance. Its own key rather than 'customers'
  // because a balance correction moves value, and 'vouchers' because a staffer
  // who may retire a promo code should not be able to rewrite every regular's
  // stamp card. Attaching a customer at the register needs no grant.
  'loyalty_manage',
  'loyalty_redeem',
  // Approving Senior/PWD discounts with a PIN and reviewing every grant in the
  // sales book. Giving the discount needs no grant (refusing one is a crime);
  // vouching for a large one and auditing the ledger is a manager's job.
  'discount_review',
  // Store activity & approvals — OPT-IN (see OPT_IN_PERMISSION_KEYS below).
  'activity_view',
  'approve_requests',
  // Reports & inventory suite: sales reports, stock, and what things cost.
  'reports',
  'inventory',
  'costs',
  // The expense book: record, fix and void expenses. Implied by nothing.
  'expenses',
  // Cash & day close: drawers, pickups, others' shifts, remittances, day
  // close. Not opt-in, implied by nothing (backfilled from store_setup).
  'cash_manage'
] as const

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number]

export interface StaffPermissionHolder {
  role: string | null
  isOwner: boolean
  /** null = full access (owners and admins created before staff management). */
  permissions: string[] | null
}

/**
 * Grants a broader grant already contains: key -> the grant that includes it.
 * Mirror of `IMPLIED_BY` in the platform repo's src/lib/staff-permissions.ts;
 * see that file for why carving a key out of an existing grant silently
 * revokes the new screen from every account already holding the parent.
 */
export const IMPLIED_BY: Readonly<Partial<Record<StaffPermissionKey, StaffPermissionKey>>> = {
  kitchen: 'orders',
  tables: 'orders',
  reports: 'analytics'
}

/** Whether `permissions` grants `key` outright or through its containing grant. */
/**
 * Keys that full access (`permissions: null`) does NOT grant — owners and
 * superadmins still hold them; everyone else needs them ticked by name.
 * Mirror of `OPT_IN_PERMISSION_KEYS` in src/lib/staff-permissions.ts (see the
 * reasoning there); the parity test pins every copy.
 */
export const OPT_IN_PERMISSION_KEYS = ['activity_view', 'approve_requests', 'expenses'] as const satisfies readonly StaffPermissionKey[]

/** Whether full access (`permissions: null`) grants `key`. */
export function isGrantedByFullAccess(key: string): boolean {
  return !(OPT_IN_PERMISSION_KEYS as readonly string[]).includes(key)
}

function listGrants(permissions: readonly string[], key: StaffPermissionKey): boolean {
  if (permissions.includes(key)) return true
  const parent = IMPLIED_BY[key]
  return parent !== undefined && permissions.includes(parent)
}

export function hasPermission(
  user: StaffPermissionHolder,
  key: StaffPermissionKey
): boolean {
  if (user.role === 'superadmin' || user.isOwner) return true
  if (user.permissions == null) return isGrantedByFullAccess(key)
  return listGrants(user.permissions, key)
}
