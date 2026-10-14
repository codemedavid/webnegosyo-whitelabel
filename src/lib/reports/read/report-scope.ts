/**
 * Who may open the sales reports, and which branch a report reads (plan §6, §7.2).
 *
 * Pure. Fails closed: no account row, another store's account or a missing key
 * is a refusal with a reason, never a store-wide read. The database refuses
 * the same callers (`reporting.assert_access` + RLS), so this decides what the
 * page SAYS; it is not the boundary.
 */

import { hasPermission } from '@/lib/staff-permissions'
import { resolveBranchScope, type BranchScope } from '@/lib/outlets/branch-scope'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { UNASSIGNED_BRANCH } from '../period'

export type ReportRefusal = 'no_account' | 'other_store' | 'no_permission' | 'platform_staff'

export type ReportAccess = { ok: true; scope: BranchScope } | { ok: false; reason: ReportRefusal }

export function reportAccessFor(appUser: AppUserScopeRow | null, tenantId: string): ReportAccess {
  if (!appUser) return { ok: false, reason: 'no_account' }
  if (appUser.role === 'superadmin') return { ok: true, scope: { kind: 'all' } }
  // `app_user_has_permission` has no platform-staff branch, so every report
  // function would refuse them: say so instead of rendering error cards.
  if (appUser.role === 'platform_staff') return { ok: false, reason: 'platform_staff' }
  if (appUser.role !== 'admin') return { ok: false, reason: 'no_permission' }
  if (appUser.tenant_id !== tenantId) return { ok: false, reason: 'other_store' }
  if (!hasPermission(appUser, 'reports')) return { ok: false, reason: 'no_permission' }
  return { ok: true, scope: resolveBranchScope(appUser) }
}

export interface ReportBranchArgs {
  p_outlet: string | null
  p_unassigned: boolean
}

export interface ReportBranch {
  /** What the report actually reads: an outlet id, `unassigned`, or null = the whole store. */
  branch: string | null
  args: ReportBranchArgs
}

const WHOLE_STORE: ReportBranch = { branch: null, args: { p_outlet: null, p_unassigned: false } }

/**
 * A branch-locked account reads its own branch whatever the URL asks. A
 * store-wide account may pick one of the store's own branches or the
 * unassigned orders; anything else reads the whole store.
 */
export function reportBranchArgs(
  scope: BranchScope,
  requested: string | null,
  storeOutletIds: readonly string[],
): ReportBranch {
  if (scope.kind === 'branch') {
    return { branch: scope.outletId, args: { p_outlet: scope.outletId, p_unassigned: false } }
  }
  if (requested === UNASSIGNED_BRANCH) {
    return { branch: UNASSIGNED_BRANCH, args: { p_outlet: null, p_unassigned: true } }
  }
  if (requested !== null && storeOutletIds.includes(requested)) {
    return { branch: requested, args: { p_outlet: requested, p_unassigned: false } }
  }
  return WHOLE_STORE
}
