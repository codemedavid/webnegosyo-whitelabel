// Staff permission gating for the desktop POS — ported from the web
// registry (src/lib/staff-permissions.ts in the platform repo). Keep the
// permission keys in sync with that source of truth.

export type StaffPermissionKey =
  | 'orders'
  | 'menu'
  | 'analytics'
  | 'store_setup'
  | 'customers'
  | 'settings'
  | 'pos'

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
