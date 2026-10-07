import { hasPermission, type PermissionHolder } from '@/lib/staff-permissions'

/** Facebook tokens and webhook changes require the same grant as Messenger settings. */
export function canManageFacebook(
  user: (PermissionHolder & { tenant_id: string | null }) | null,
  tenantId: string,
): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  return user.role === 'admin' && user.tenant_id === tenantId && hasPermission(user, 'settings')
}
