// Decision core of the manage-staff edge function.
//
// The merchant app manages staff from the phone, but creating and deleting
// auth users needs the service-role key, which never ships in the app. So the
// app calls this function, and this module decides — with no I/O of its own —
// what the caller may do. It is a self-contained port of the web originals
// (src/lib/staff-service.ts, staff-permissions.ts, staff-default-screen.ts,
// outlets/branch-scope.ts, billing/plan.ts): edge functions deploy as a
// standalone Deno bundle and cannot import the Next.js tree, so the rules are
// duplicated here and tests/unit/manage-staff-core.test.ts pins this copy to
// the web source of truth key by key.
//
// No Deno imports in this file — that is what lets the web Jest suite execute
// it directly. All wiring (JWT, service-role client, env) lives in index.ts.

// ============================================
// Permission registry (mirror of src/lib/staff-permissions.ts)
// ============================================

export const STAFF_PERMISSION_KEYS = [
  'orders',
  'menu',
  'analytics',
  'store_setup',
  'customers',
  'settings',
  'pos',
  'branch_staff',
  'order_edit',
  'order_refund',
  'vouchers',
  'kitchen',
] as const

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number]

export interface StaffCaller {
  user_id: string
  tenant_id: string
  role: string
  is_owner: boolean
  outlet_id?: string | null
  /** null = full access (owners and admins created before staff management). */
  permissions: string[] | null
}

function hasPermission(caller: StaffCaller, key: StaffPermissionKey): boolean {
  if (caller.role === 'superadmin' || caller.is_owner) return true
  if (caller.permissions == null) return true
  return caller.permissions.includes(key)
}

export function validatePermissionKeys(input: unknown): StaffPermissionKey[] {
  if (!Array.isArray(input)) {
    throw new Error('Permissions must be a list of permission keys')
  }
  const known = new Set<string>(STAFF_PERMISSION_KEYS)
  const result: StaffPermissionKey[] = []
  for (const key of input) {
    if (typeof key !== 'string' || !known.has(key)) {
      throw new Error(`Unknown permission key: ${String(key)}`)
    }
    if (!result.includes(key as StaffPermissionKey)) {
      result.push(key as StaffPermissionKey)
    }
  }
  if (result.length === 0) {
    throw new Error('Select at least one permission')
  }
  return result
}

// ============================================
// Default screen (mirror of src/lib/staff-default-screen.ts)
// ============================================

/** App tab route → grant needed to open it (null = open to every account). */
export const DEFAULT_SCREEN_PERMISSIONS: Record<string, StaffPermissionKey | null> = {
  dashboard: null,
  orders: 'orders',
  kitchen: 'kitchen',
  scheduled: 'orders',
  pos: 'pos',
  'pos-sales': 'pos',
  analytics: 'analytics',
  growth: 'analytics',
  customers: 'customers',
  trends: 'analytics',
  'product-analytics': 'analytics',
  'product-management': 'menu',
  inventory: 'menu',
  'daily-report': 'menu',
  payments: 'store_setup',
  portfolio: 'analytics',
  branches: 'analytics',
  'branch-menu': 'menu',
}

function holdsPermission(
  permissions: readonly string[] | null,
  required: StaffPermissionKey | null
): boolean {
  if (required === null) return true
  if (permissions === null) return true
  return permissions.includes(required)
}

/** The stored value for a submitted choice, or null for "no preference". */
export function validateDefaultTab(
  input: unknown,
  permissions: readonly string[] | null
): string | null {
  if (typeof input !== 'string') return null
  const tab = input.trim()
  if (tab === '') return null
  const required = DEFAULT_SCREEN_PERMISSIONS[tab]
  if (required === undefined) return null
  return holdsPermission(permissions, required) ? tab : null
}

// ============================================
// Branch scope (mirror of src/lib/outlets/branch-scope.ts)
// ============================================

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whether this caller may create or edit a staff account at `targetOutletId`
 * (null meaning a tenant-wide account). Owners and superadmins may do
 * anything; a branch admin — branch-locked and holding `branch_staff` — may
 * manage only its own branch, never a tenant-wide account.
 */
export function canManageBranchStaff(
  caller: StaffCaller,
  targetOutletId: string | null
): boolean {
  if (caller.role === 'superadmin' || caller.is_owner) return true
  if (caller.role !== 'admin') return false

  const callerOutletId = trimmed(caller.outlet_id)
  if (callerOutletId === '') return false

  if (!hasPermission(caller, 'branch_staff')) return false

  return trimmed(targetOutletId) === callerOutletId
}

function resolveStaffOutletId(
  input: string | null | undefined,
  outlets: readonly { id: string }[]
): string | null {
  if (input == null) return null
  if (typeof input !== 'string') {
    throw new Error('Branch must be a branch id or empty for all branches')
  }
  const wanted = input.trim()
  if (wanted === '') return null
  const match = outlets.find((outlet) => outlet.id === wanted)
  if (!match) {
    throw new Error('Unknown branch for this store')
  }
  return wanted
}

// ============================================
// Staff limit (mirror of src/lib/billing defaults)
// ============================================

const DEFAULT_MAX_STAFF_PER_BRANCH = 3

function resolveStaffLimit(maxStaffPerBranch: number | null | undefined): number {
  if (maxStaffPerBranch === null || maxStaffPerBranch === undefined) {
    return DEFAULT_MAX_STAFF_PER_BRANCH
  }
  if (!Number.isFinite(maxStaffPerBranch)) return DEFAULT_MAX_STAFF_PER_BRANCH
  const floored = Math.floor(maxStaffPerBranch)
  return floored < 0 ? DEFAULT_MAX_STAFF_PER_BRANCH : floored
}

// ============================================
// Store contract and records
// ============================================

export interface StaffRecord {
  user_id: string
  tenant_id: string
  role: string
  is_owner: boolean
  outlet_id?: string | null
  permissions: string[] | null
  display_name: string | null
  email: string | null
  default_tab?: string | null
  created_at: string
}

export interface StaffCoreStore {
  listStaff(tenantId: string): Promise<StaffRecord[]>
  createAuthUser(input: { email: string; password: string }): Promise<{ userId: string }>
  insertStaffRow(row: StaffRecord): Promise<void>
  updateStaffRow(userId: string, patch: Partial<StaffRecord>): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
  updateAuthPassword(userId: string, password: string): Promise<void>
}

export interface StaffActionContext {
  /** The tenant's own branches, used to validate an assignment. */
  outlets: readonly { id: string }[]
  /** Per-branch seat allowance from the tenant's plan; absent = platform default. */
  maxStaffPerBranch?: number
}

// ============================================
// Shared guards
// ============================================

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertValidPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
}

async function findTenantStaff(
  store: StaffCoreStore,
  tenantId: string,
  userId: string
): Promise<StaffRecord> {
  const staff = await store.listStaff(tenantId)
  const found = staff.find((s) => s.user_id === userId)
  if (!found) {
    throw new Error('Staff member not found for this tenant')
  }
  return found
}

function assertNotOwner(target: StaffRecord): void {
  if (target.is_owner) {
    throw new Error('The tenant owner account cannot be modified here')
  }
}

function assertCanManage(target: StaffRecord, caller: StaffCaller): void {
  if (canManageBranchStaff(caller, target.outlet_id ?? null)) return
  throw new Error('You cannot manage staff for that branch')
}

function resolveTargetBranch(
  requested: string | null | undefined,
  caller: StaffCaller,
  context: StaffActionContext
): string | null {
  const outletId = resolveStaffOutletId(requested, context.outlets)
  if (!canManageBranchStaff(caller, outletId)) {
    throw new Error('You cannot manage staff for that branch')
  }
  return outletId
}

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
  context: StaffActionContext,
  excludeUserId?: string
): void {
  const limit = resolveStaffLimit(context.maxStaffPerBranch)
  if (countStaffInBranch(staff, outletId, excludeUserId) < limit) return
  throw new Error(
    outletId
      ? `This branch already has the maximum of ${limit} staff accounts`
      : `This store already has the maximum of ${limit} staff accounts`
  )
}

// ============================================
// Actions
// ============================================

export interface CreateStaffInput {
  email: string
  password: string
  displayName: string
  permissions: string[]
  outletId?: string | null
  defaultTab?: string | null
}

async function listVisibleStaff(
  store: StaffCoreStore,
  caller: StaffCaller
): Promise<StaffRecord[]> {
  const staff = await store.listStaff(caller.tenant_id)
  // A branch admin sees only its own branch's people — the list is also the
  // menu of accounts it can act on. Its own row stays visible either way.
  return staff.filter(
    (s) =>
      canManageBranchStaff(caller, s.outlet_id ?? null) ||
      s.user_id === caller.user_id
  )
}

async function createStaff(
  store: StaffCoreStore,
  caller: StaffCaller,
  context: StaffActionContext,
  input: CreateStaffInput
): Promise<StaffRecord> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Enter a valid email address')
  }
  assertValidPassword(input.password)
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName) {
    throw new Error('Enter a display name')
  }
  const permissions = validatePermissionKeys(input.permissions)

  // Validated before the auth user is created, so a rejected branch cannot
  // leave a login behind with no account attached to it.
  const outletId = resolveTargetBranch(input.outletId, caller, context)

  const existing = await store.listStaff(caller.tenant_id)
  assertBranchHasRoom(existing, outletId, context)

  const { userId } = await store.createAuthUser({ email, password: input.password })
  const row: StaffRecord = {
    user_id: userId,
    tenant_id: caller.tenant_id,
    role: 'admin',
    is_owner: false,
    outlet_id: outletId,
    permissions,
    display_name: displayName,
    email,
    default_tab: validateDefaultTab(input.defaultTab, permissions),
    created_at: new Date().toISOString(),
  }
  await store.insertStaffRow(row)
  return row
}

async function updateStaffPermissions(
  store: StaffCoreStore,
  caller: StaffCaller,
  userId: string,
  permissions: unknown
): Promise<void> {
  const target = await findTenantStaff(store, caller.tenant_id, userId)
  assertNotOwner(target)
  assertCanManage(target, caller)
  const validated = validatePermissionKeys(permissions)

  // A pinned screen can outlive the grant that opened it; leaving the stale
  // value behind means the dialog reports a setting that no longer works.
  const keptScreen = validateDefaultTab(target.default_tab, validated)
  const patch: Partial<StaffRecord> =
    keptScreen === (target.default_tab ?? null)
      ? { permissions: validated }
      : { permissions: validated, default_tab: keptScreen }

  await store.updateStaffRow(userId, patch)
}

async function updateStaffBranch(
  store: StaffCoreStore,
  caller: StaffCaller,
  context: StaffActionContext,
  userId: string,
  outletId: string | null
): Promise<void> {
  const target = await findTenantStaff(store, caller.tenant_id, userId)
  assertNotOwner(target)

  // A branch admin must be able to manage BOTH ends of the move.
  if (!canManageBranchStaff(caller, target.outlet_id ?? null)) {
    throw new Error('You cannot manage staff for that branch')
  }

  const destination = resolveTargetBranch(outletId, caller, context)
  if (destination === (target.outlet_id ?? null)) return

  const existing = await store.listStaff(caller.tenant_id)
  assertBranchHasRoom(existing, destination, context, userId)

  await store.updateStaffRow(userId, { outlet_id: destination })
}

async function updateStaffDefaultScreen(
  store: StaffCoreStore,
  caller: StaffCaller,
  userId: string,
  defaultTab: unknown
): Promise<void> {
  const target = await findTenantStaff(store, caller.tenant_id, userId)
  assertNotOwner(target)
  assertCanManage(target, caller)
  await store.updateStaffRow(userId, {
    default_tab: validateDefaultTab(defaultTab, target.permissions),
  })
}

async function resetStaffPassword(
  store: StaffCoreStore,
  caller: StaffCaller,
  userId: string,
  newPassword: unknown
): Promise<void> {
  assertValidPassword(newPassword)
  const target = await findTenantStaff(store, caller.tenant_id, userId)
  assertNotOwner(target)
  assertCanManage(target, caller)
  await store.updateAuthPassword(userId, newPassword)
}

async function removeStaff(
  store: StaffCoreStore,
  caller: StaffCaller,
  userId: string
): Promise<void> {
  const target = await findTenantStaff(store, caller.tenant_id, userId)
  assertNotOwner(target)
  assertCanManage(target, caller)
  // Auth-user deletion cascades to the app_users row via FK.
  await store.deleteAuthUser(userId)
}

// ============================================
// Dispatcher
// ============================================

export type StaffActionRequest =
  | { action: 'list' }
  | { action: 'create'; input: CreateStaffInput }
  | { action: 'update_permissions'; userId: string; permissions: string[] }
  | { action: 'update_branch'; userId: string; outletId: string | null }
  | { action: 'update_default_screen'; userId: string; defaultTab: string | null }
  | { action: 'reset_password'; userId: string; newPassword: string }
  | { action: 'remove'; userId: string }

export interface StaffActionResult {
  status: number
  body: { success: boolean; data?: unknown; error?: string }
}

/**
 * May this caller manage staff at all? The owner (or a superadmin) manages
 * everyone; a branch admin manages its own branch. Individual actions re-check
 * the specific target branch — this is only the front door.
 */
function isStaffManager(caller: StaffCaller): boolean {
  if (caller.role === 'superadmin' || caller.is_owner) return true
  return canManageBranchStaff(caller, caller.outlet_id ?? null)
}

function ok(data?: unknown): StaffActionResult {
  return { status: 200, body: { success: true, data } }
}

function fail(status: number, error: string): StaffActionResult {
  return { status, body: { success: false, error } }
}

export async function handleStaffAction(
  store: StaffCoreStore,
  caller: StaffCaller,
  context: StaffActionContext,
  request: StaffActionRequest
): Promise<StaffActionResult> {
  if (!isStaffManager(caller)) {
    return fail(403, 'Only the store owner or a branch admin can manage staff')
  }

  try {
    switch (request.action) {
      case 'list':
        return ok(await listVisibleStaff(store, caller))
      case 'create':
        return ok(await createStaff(store, caller, context, request.input))
      case 'update_permissions':
        await updateStaffPermissions(store, caller, request.userId, request.permissions)
        return ok()
      case 'update_branch':
        await updateStaffBranch(store, caller, context, request.userId, request.outletId)
        return ok()
      case 'update_default_screen':
        await updateStaffDefaultScreen(store, caller, request.userId, request.defaultTab)
        return ok()
      case 'reset_password':
        await resetStaffPassword(store, caller, request.userId, request.newPassword)
        return ok()
      case 'remove':
        await removeStaff(store, caller, request.userId)
        return ok()
      default:
        return fail(400, 'Unknown action')
    }
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'The request failed')
  }
}
