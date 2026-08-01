// Staff account management for tenant admins. Pure business logic over an
// injected StaffStore so it can be unit-tested with an in-memory fake (same
// pattern as customers-service). The Supabase-backed store lives in the
// server action layer, which is the only place with service-role access.

import { resolveStaffLimit } from '@/lib/billing/subscription-status'
import {
  validatePermissionKeys,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import {
  canManageBranchStaff,
  resolveStaffOutletId,
  type BranchStaffActor,
  type StaffOutletCandidate,
} from '@/lib/outlets/branch-scope'

export interface StaffRecord {
  user_id: string
  tenant_id: string
  role: string
  is_owner: boolean
  /**
   * Branch this account is confined to; null (or absent, on a store with no
   * branches) means the whole store.
   */
  outlet_id?: string | null
  permissions: string[] | null
  display_name: string | null
  email: string | null
  created_at: string
}

/**
 * Who is asking, and which branches exist.
 *
 * Optional so a single-location store calls these functions exactly as it does
 * today. Omitting `actor` skips the branch-authorisation check, which is safe
 * only because the caller — a server action — has already established that the
 * signed-in user may manage this tenant's staff at all.
 */
export interface StaffBranchContext {
  /** The tenant's own branches, used to validate an assignment. */
  outlets?: readonly StaffOutletCandidate[]
  /** The signed-in account performing the change. */
  actor?: BranchStaffActor
  /**
   * Seats this tenant may fill per branch, from their subscription.
   *
   * Absent means the platform default, NOT unlimited: a caller that has not
   * been taught about allowances yet must behave exactly as it did before.
   */
  maxStaffPerBranch?: number
}

export interface StaffStore {
  listStaff(tenantId: string): Promise<StaffRecord[]>
  createAuthUser(input: { email: string; password: string }): Promise<{ userId: string }>
  insertStaffRow(row: StaffRecord): Promise<void>
  updateStaffRow(userId: string, patch: Partial<StaffRecord>): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
  updateAuthPassword(userId: string, password: string): Promise<void>
}

export interface CreateStaffInput {
  email: string
  password: string
  displayName: string
  permissions: string[]
  /** Branch to confine the account to. Absent/empty = the whole store. */
  outletId?: string | null
}

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
}

async function findTenantStaff(
  store: StaffStore,
  tenantId: string,
  userId: string
): Promise<StaffRecord> {
  const staff = await store.listStaff(tenantId)
  const record = staff.find((s) => s.user_id === userId)
  if (!record) {
    throw new Error('Staff member not found for this tenant')
  }
  return record
}

/**
 * The branch an account is being assigned to, once validated against the
 * store's own branches and the asking account's authority.
 */
function resolveTargetBranch(
  requested: string | null | undefined,
  context: StaffBranchContext
): string | null {
  const outletId = resolveStaffOutletId(requested, context.outlets ?? [])

  if (context.actor && !canManageBranchStaff(context.actor, outletId)) {
    throw new Error('You cannot manage staff for that branch')
  }

  return outletId
}

/**
 * How many staff already occupy a branch's allowance.
 *
 * Counted per branch rather than per store: a store-wide cap would leave a
 * five-branch business sharing three logins. The owner never counts, and
 * store-wide accounts form their own pool.
 */
function countStaffInBranch(
  staff: readonly StaffRecord[],
  outletId: string | null,
  excludeUserId?: string
): number {
  return staff.filter(
    (s) =>
      !s.is_owner &&
      (s.outlet_id ?? null) === outletId &&
      s.user_id !== excludeUserId
  ).length
}

function assertBranchHasRoom(
  staff: readonly StaffRecord[],
  outletId: string | null,
  context: StaffBranchContext,
  excludeUserId?: string
): void {
  const limit = resolveStaffLimit({ max_staff_per_branch: context.maxStaffPerBranch ?? null })

  if (countStaffInBranch(staff, outletId, excludeUserId) < limit) return

  throw new Error(
    outletId
      ? `This branch already has the maximum of ${limit} staff accounts`
      : `This store already has the maximum of ${limit} staff accounts`
  )
}

function assertNotOwner(record: StaffRecord): void {
  if (record.is_owner) {
    throw new Error('The tenant owner account cannot be modified here')
  }
}

/**
 * Whether the asking account may touch this one at all.
 *
 * A branch admin able to create accounts but not edit or remove them would
 * leave the owner cleaning up after every branch, so the same check guards
 * every write.
 */
function assertCanManage(record: StaffRecord, context: StaffBranchContext): void {
  if (!context.actor) return
  if (canManageBranchStaff(context.actor, record.outlet_id ?? null)) return
  throw new Error('You cannot manage staff for that branch')
}

/** Creates a staff account (auth user + app_users row), enforcing the per-branch limit. */
export async function createStaff(
  store: StaffStore,
  tenantId: string,
  input: CreateStaffInput,
  context: StaffBranchContext = {}
): Promise<StaffRecord> {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Enter a valid email address')
  }
  assertValidPassword(input.password)
  const displayName = input.displayName.trim()
  if (!displayName) {
    throw new Error('Enter a display name')
  }
  const permissions: StaffPermissionKey[] = validatePermissionKeys(input.permissions)

  // Validated before the auth user is created, so a rejected branch cannot
  // leave a login behind with no account attached to it.
  const outletId = resolveTargetBranch(input.outletId, context)

  const existing = await store.listStaff(tenantId)
  assertBranchHasRoom(existing, outletId, context)

  const { userId } = await store.createAuthUser({ email, password: input.password })
  const row: StaffRecord = {
    user_id: userId,
    tenant_id: tenantId,
    role: 'admin',
    is_owner: false,
    outlet_id: outletId,
    permissions,
    display_name: displayName,
    email,
    created_at: new Date().toISOString(),
  }
  await store.insertStaffRow(row)
  return row
}

/** Replaces a staff member's permission list. The owner cannot be modified. */
export async function updateStaffPermissions(
  store: StaffStore,
  tenantId: string,
  userId: string,
  permissions: string[],
  context: StaffBranchContext = {}
): Promise<void> {
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  assertCanManage(record, context)
  const validated = validatePermissionKeys(permissions)
  await store.updateStaffRow(userId, { permissions: validated })
}

/**
 * Moves a staff account to another branch, or widens it to the whole store.
 *
 * A branch admin must be able to manage BOTH ends of the move: the branch the
 * account is leaving and the one it is joining. Otherwise it could push its own
 * staff onto a branch it has no authority over, or claim someone else's.
 */
export async function updateStaffBranch(
  store: StaffStore,
  tenantId: string,
  userId: string,
  outletId: string | null,
  context: StaffBranchContext = {}
): Promise<void> {
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)

  if (context.actor && !canManageBranchStaff(context.actor, record.outlet_id ?? null)) {
    throw new Error('You cannot manage staff for that branch')
  }

  const target = resolveTargetBranch(outletId, context)
  if (target === (record.outlet_id ?? null)) return

  const existing = await store.listStaff(tenantId)
  assertBranchHasRoom(existing, target, context, userId)

  await store.updateStaffRow(userId, { outlet_id: target })
}

/** Sets a new password for a staff member. The owner manages their own password. */
export async function resetStaffPassword(
  store: StaffStore,
  tenantId: string,
  userId: string,
  newPassword: string,
  context: StaffBranchContext = {}
): Promise<void> {
  assertValidPassword(newPassword)
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  assertCanManage(record, context)
  await store.updateAuthPassword(userId, newPassword)
}

/** Deletes a staff account entirely (auth user cascade removes the app_users row). */
export async function removeStaff(
  store: StaffStore,
  tenantId: string,
  userId: string,
  context: StaffBranchContext = {}
): Promise<void> {
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  assertCanManage(record, context)
  await store.deleteAuthUser(userId)
}
