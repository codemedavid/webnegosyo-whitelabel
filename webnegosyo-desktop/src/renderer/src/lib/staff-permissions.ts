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
  'vouchers'
] as const

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number]

export interface StaffPermissionHolder {
  role: string | null
  isOwner: boolean
  /** null = full access (owners and admins created before staff management). */
  permissions: string[] | null
}

export function hasPermission(
  user: StaffPermissionHolder,
  key: StaffPermissionKey
): boolean {
  if (user.role === 'superadmin' || user.isOwner) return true
  if (user.permissions == null) return true
  return user.permissions.includes(key)
}
