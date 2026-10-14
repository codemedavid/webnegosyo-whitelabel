/**
 * The door to /admin/texts, its live endpoint and its Server Actions.
 *
 * A store admin with the `customers` permission (owners, superadmins and
 * legacy full-access admins pass), store-wide only: texts reach every guest
 * of the store, so a branch-locked account is refused — the same rule the
 * app's automations route applies (`api/http.ts`). The middleware gates the
 * page path too (`texts` in ADMIN_SECTION_PERMISSIONS and the store-wide
 * sections); this is the boundary for POSTs aimed straight at an action.
 *
 * Owner = store owner or superadmin (`canManageStaff`), the same rule the
 * phone revoke SQL enforces.
 */

import 'server-only'
import { verifyTenantPermission } from '@/lib/admin-service'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { canManageStaff } from '@/lib/staff-permissions'
import type { PlatformAction } from '@/lib/platform-staff/permissions'

export const BRANCH_REFUSAL = 'Unauthorized: Texts are for the whole store'

export interface TextsCaller {
  userId: string
  isOwner: boolean
}

/** Throws on refusal. `action` narrows platform staff only (reads pass 'view'). */
export async function requireTextsAccess(tenantId: string, action: PlatformAction = 'edit'): Promise<TextsCaller> {
  const { user, userRole } = await verifyTenantPermission(tenantId, 'customers', action)
  if (resolveBranchScope(userRole).kind !== 'all') throw new Error(BRANCH_REFUSAL)
  return { userId: user.id, isOwner: canManageStaff(userRole) }
}
