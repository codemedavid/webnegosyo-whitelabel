/**
 * The session kinds of `access.ts`: a store's staff and the platform console.
 * Loaded on demand by `defineRoute` / `defineAction` (see `access.ts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import { verifyTenantAdmin, verifyTenantPermission } from '@/lib/admin-service'
import { authenticateBearer, requireBearerStoreCaller, type BearerCaller } from '@/lib/auth/bearer-caller'
import { getRequestCaller } from '@/lib/auth/request-caller'
import { callerHasFeature, resolveCallerOutlet } from '@/lib/gov-discount-ledger/caller-scope'
import { resolveRouteOutlet } from '@/lib/gov-discount-ledger/route-guards'
import { resolveBranchScope } from '@/lib/outlets/branch-scope'
import { requireFullSuperadmin, requirePlatformPermission } from '@/lib/platform-staff/guard'
import { canAccessStoreAdmin } from '@/lib/platform-staff/permissions'
import type { AppUserScopeRow } from '@/lib/queries/fetch-app-user-scope'
import { hasAnyPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import { createClient } from '@/lib/supabase/server'
import { refuse, unavailable, type AccessRefusal, type AccessResult } from './access'
import type { ConsoleCallerContext, StaffAuth, StaffCaller, StaffPermission, SuperadminAuth } from './entry'

const STORE_WIDE_ONLY = 'Only store-wide accounts can do this.'
const OWN_BRANCH_ONLY = 'You can only act for your own branch.'
const UNKNOWN_BRANCH = 'That branch is not part of this store.'

/**
 * What `verifyTenantAdmin` / `verifyTenantPermission` threw, as a refusal.
 * They speak in message prefixes (the routes that call them by hand match the
 * same strings); `access-parity.test.ts` runs the real helpers against this.
 */
function classifySessionError(error: unknown): { ok: false; refusal: AccessRefusal } {
  if (!(error instanceof Error)) return unavailable('staff', error)
  // By name, not instanceof: a second copy of the module would defeat instanceof.
  if (error.name === 'SubscriptionPausedError') return refuse('subscription')
  if (error.message === 'Unauthorized: Not authenticated') return refuse('unauthenticated')
  if (error.message === 'Unauthorized: Missing permission for this feature') return refuse('permission')
  if (error.message.startsWith('Unauthorized')) return refuse('not-member')
  return unavailable('staff', error)
}

function holdsPermission(appUser: AppUserScopeRow, permission: StaffPermission): boolean {
  if (permission === 'any-staff') return true
  const keys: readonly StaffPermissionKey[] = typeof permission === 'string' ? [permission] : permission
  return keys.some((key) => callerHasFeature(appUser, key))
}

interface BranchOutcome {
  ok: true
  outletId: string | null
}

/** The declared branch rule, applied to the account the access check returned. */
async function applyBranchRule<TInput>(
  auth: StaffAuth<TInput>,
  appUser: AppUserScopeRow,
  tenant: string,
  input: TInput,
  callerClient: () => Promise<SupabaseClient>,
): Promise<BranchOutcome | { ok: false; refusal: AccessRefusal }> {
  if (auth.branch === 'any') return { ok: true, outletId: null }

  if (auth.branch === 'store-wide') {
    return resolveBranchScope(appUser).kind === 'all'
      ? { ok: true, outletId: null }
      : refuse('branch', { message: STORE_WIDE_ONLY })
  }

  const requested = auth.branchClaim?.(input) ?? null
  // Naming no branch needs no lookup: a locked account acts for its own, a store-wide one for the store.
  const outlet = requested === null
    ? resolveCallerOutlet(appUser, null, new Set())
    : await resolveRouteOutlet(
        (await callerClient()) as unknown as Parameters<typeof resolveRouteOutlet>[0],
        appUser,
        tenant,
        requested,
      )
  if (outlet.ok) return { ok: true, outletId: outlet.outletId }
  return outlet.status === 403
    ? refuse('branch', { message: OWN_BRANCH_ONLY })
    : refuse('invalid', { message: UNKNOWN_BRANCH })
}

function staffCaller(
  tenant: string,
  user: StaffCaller['user'],
  appUser: AppUserScopeRow,
  outletId: string | null,
  callerClient: () => Promise<SupabaseClient>,
): StaffCaller {
  return {
    tenant,
    user,
    appUser,
    outletId,
    callerClient,
    // Worked out when read: most handlers never ask.
    get branch() {
      return resolveBranchScope(appUser)
    },
  }
}

/** A helper's ready 401/403, kept as the response and given its code. */
function passThrough(response: Response): { ok: false; refusal: AccessRefusal } {
  return refuse(response.status === 401 ? 'unauthenticated' : 'not-member', { response })
}

async function resolveBearerStaff<TInput>(
  request: Request,
  auth: StaffAuth<TInput>,
  input: TInput,
): Promise<AccessResult<StaffCaller>> {
  const access = auth.access ?? 'edit'
  let caller: BearerCaller
  let tenant: string

  if (auth.storeClaim) {
    tenant = auth.storeClaim(input)
    const result = await requireBearerStoreCaller(request, tenant, access)
    if (!result.ok) return passThrough(result.response)
    caller = result
  } else {
    const result = await authenticateBearer(request)
    if (!result.ok) return passThrough(result.response)
    const own = result.appUser?.tenant_id
    if (!own || !canAccessStoreAdmin(result.appUser, own, access)) return refuse('not-member')
    caller = result
    tenant = own
  }

  const { appUser, user, supabase } = caller
  if (auth.permission !== 'any-staff' && (!appUser || !holdsPermission(appUser, auth.permission))) {
    return refuse('permission')
  }
  // Membership passed, so the row exists; the cast only narrows the helper's nullable type.
  const account = appUser as AppUserScopeRow
  const callerClient = async () => supabase
  const branch = await applyBranchRule(auth, account, tenant, input, callerClient)
  if (!branch.ok) return branch

  return {
    ok: true,
    caller: staffCaller(tenant, user, account, branch.outletId, callerClient),
    subject: { userId: user?.id, tenant },
  }
}

async function resolveSessionStaff<TInput>(auth: StaffAuth<TInput>, input: TInput): Promise<AccessResult<StaffCaller>> {
  const access = auth.access ?? 'edit'
  let tenant: string

  if (auth.storeClaim) {
    tenant = auth.storeClaim(input)
  } else {
    const { user, appUser } = await getRequestCaller()
    if (!user) return refuse('unauthenticated')
    if (!appUser?.tenant_id) return refuse('not-member')
    tenant = appUser.tenant_id
  }

  let verified: Awaited<ReturnType<typeof verifyTenantAdmin>>
  try {
    const { permission } = auth
    // One key goes to the helper that checks it; a list is "any one of", checked after membership.
    verified = typeof permission === 'string' && permission !== 'any-staff'
      ? await verifyTenantPermission(tenant, permission, access)
      : await verifyTenantAdmin(tenant, access)
    if (typeof permission !== 'string' && !hasAnyPermission(verified.userRole, permission)) return refuse('permission')
  } catch (error) {
    unstable_rethrow(error)
    return classifySessionError(error)
  }

  // The helper resolved, so access is granted; these are its answer, passed on as given.
  const user = verified?.user
  const appUser = verified?.userRole as AppUserScopeRow
  const callerClient = async () => (await createClient()) as unknown as SupabaseClient
  const branch = await applyBranchRule(auth, appUser, tenant, input, callerClient)
  if (!branch.ok) return branch

  return {
    ok: true,
    caller: staffCaller(tenant, user, appUser, branch.outletId, callerClient),
    subject: { userId: user?.id, tenant },
  }
}

/**
 * A store's staff (or a console account acting for a store). `request` is
 * null for a server action, which can only be a cookie session.
 */
export async function resolveStaffAccess<TInput>(
  request: Request | null,
  auth: StaffAuth<TInput>,
  input: TInput,
): Promise<AccessResult<StaffCaller>> {
  try {
    if (auth.session === 'bearer') {
      if (!request) return refuse('unauthenticated')
      return await resolveBearerStaff(request, auth, input)
    }
    return await resolveSessionStaff(auth, input)
  } catch (error) {
    unstable_rethrow(error)
    return unavailable('staff', error)
  }
}

/** A superadmin, or platform staff holding the console grant. */
export async function resolveConsoleAccess(auth: SuperadminAuth): Promise<AccessResult<ConsoleCallerContext>> {
  try {
    const caller = auth.permission === 'full-superadmin'
      ? await requireFullSuperadmin()
      : await requirePlatformPermission(auth.permission)
    return { ok: true, caller: { user: caller.user, appUser: caller.appUser }, subject: { userId: caller.user.id } }
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof Error && error.name === 'PlatformAccessError') {
      return refuse(error.message.startsWith('Unauthorized') ? 'unauthenticated' : 'not-member')
    }
    return unavailable('superadmin', error)
  }
}
