/**
 * The server-side gate for stock and cost work (Phase 0d, plan §6.1).
 *
 * `menu` used to carry everything on the Inventory screens. It now keeps the
 * ingredient master, recipes and units; stock moved to `inventory` and prices
 * to `costs`. `verifyTenantPermission` refuses with one generic sentence for
 * every feature, so these gates refuse with a sentence naming the grant
 * (`permission-refusals.ts`).
 *
 * The database enforces the same split (migration 20261013120100); these
 * checks make the refusal readable and stop the request before any read.
 */

import { verifyTenantAdmin } from '@/lib/admin-service'
import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { PlatformAction } from '@/lib/platform-staff/permissions'

export { PERMISSION_REFUSALS, isPermissionRefusal } from '@/lib/inventory/permission-refusals'

/**
 * Verify the caller is staff of this store AND holds `key`, refusing with
 * `refusal` when they do not. Owners, superadmins and legacy full-access
 * accounts hold every key. `action` is the platform-staff verb.
 */
export async function requireGrant(
  tenantId: string,
  key: StaffPermissionKey,
  action: PlatformAction,
  refusal: string,
) {
  const result = await verifyTenantAdmin(tenantId, action)
  if (!hasPermission(result.userRole, key)) throw new Error(refusal)
  return result
}
