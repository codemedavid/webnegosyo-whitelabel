/**
 * Who may open the expense book, and which branch it reads (contract §3, §7).
 *
 * Pure, and fails closed: no account row, another store's account, platform
 * staff or a missing `expenses` key is a refusal, never a store-wide read.
 * RLS refuses the same callers, so this decides what the page SAYS; it is not
 * the boundary.
 */

import { resolveBranchScope, type BranchScope } from '@/lib/outlets/branch-scope'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { hasPermission } from '@/lib/staff-permissions'

export type ExpensesRefusal = 'no_account' | 'other_store' | 'no_permission'

export type ExpensesAccess = { ok: true; scope: BranchScope } | { ok: false; reason: ExpensesRefusal }

export function expensesAccessFor(appUser: AppUserScopeRow | null, tenantId: string): ExpensesAccess {
  if (!appUser) return { ok: false, reason: 'no_account' }
  if (appUser.role === 'superadmin') return { ok: true, scope: { kind: 'all' } }
  // `app_user_has_permission` has no platform-staff branch: every read would come back empty.
  if (appUser.role !== 'admin') return { ok: false, reason: 'no_permission' }
  if (appUser.tenant_id !== tenantId) return { ok: false, reason: 'other_store' }
  if (!hasPermission(appUser, 'expenses')) return { ok: false, reason: 'no_permission' }
  return { ok: true, scope: resolveBranchScope(appUser) }
}
