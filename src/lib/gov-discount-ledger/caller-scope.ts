/**
 * Who may act on the Senior/PWD routes, beyond "is a member of the store".
 *
 * `requireBearerStoreCaller` answers membership only. A discount is money and
 * a sales-book row is a tax record, so each route also names the FEATURE it
 * needs (`pos` to give a discount, `discount_review` to approve one), and any
 * branch the request names must be one the caller may act for: a
 * branch-locked account only its own, a store-wide account any of the store's.
 *
 * Pure — the routes read the account and the store's branches and pass them in.
 */

import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { hasPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'

type CallerAccount = Pick<AppUserScopeRow, 'role' | 'is_owner' | 'permissions' | 'outlet_id'>

/** Owners, superadmins and full-access accounts always; staff by their grants. */
export function callerHasFeature(appUser: CallerAccount | null, key: StaffPermissionKey): boolean {
  if (!appUser) return false
  return hasPermission(
    { role: appUser.role, is_owner: appUser.is_owner ?? false, permissions: appUser.permissions ?? null },
    key,
  )
}

export type CallerOutlet = { ok: true; outletId: string | null } | { ok: false; status: 400 | 403 }

/**
 * The branch this request acts for. A branch-locked caller always acts for
 * its own branch (naming another is refused); a store-wide caller may name any
 * branch of the store, or none.
 */
export function resolveCallerOutlet(
  appUser: CallerAccount,
  requested: string | null,
  tenantOutletIds: ReadonlySet<string>,
): CallerOutlet {
  const scope = resolveBranchScope({
    role: appUser.role,
    is_owner: appUser.is_owner,
    outlet_id: appUser.outlet_id,
  })
  if (scope.kind === 'branch') {
    if (requested !== null && requested !== scope.outletId) return { ok: false, status: 403 }
    return { ok: true, outletId: scope.outletId }
  }
  if (requested === null) return { ok: true, outletId: null }
  return tenantOutletIds.has(requested) ? { ok: true, outletId: requested } : { ok: false, status: 400 }
}
