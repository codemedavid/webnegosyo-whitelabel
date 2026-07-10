// Staff account management for tenant admins. Pure business logic over an
// injected StaffStore so it can be unit-tested with an in-memory fake (same
// pattern as customers-service). The Supabase-backed store lives in the
// server action layer, which is the only place with service-role access.

import {
  MAX_STAFF_PER_TENANT,
  validatePermissionKeys,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'

export interface StaffRecord {
  user_id: string
  tenant_id: string
  role: string
  is_owner: boolean
  permissions: string[] | null
  display_name: string | null
  email: string | null
  created_at: string
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

function assertNotOwner(record: StaffRecord): void {
  if (record.is_owner) {
    throw new Error('The tenant owner account cannot be modified here')
  }
}

/** Creates a staff account (auth user + app_users row), enforcing the per-tenant limit. */
export async function createStaff(
  store: StaffStore,
  tenantId: string,
  input: CreateStaffInput
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

  const existing = await store.listStaff(tenantId)
  const staffCount = existing.filter((s) => !s.is_owner).length
  if (staffCount >= MAX_STAFF_PER_TENANT) {
    throw new Error(
      `This store already has the maximum of ${MAX_STAFF_PER_TENANT} staff accounts`
    )
  }

  const { userId } = await store.createAuthUser({ email, password: input.password })
  const row: StaffRecord = {
    user_id: userId,
    tenant_id: tenantId,
    role: 'admin',
    is_owner: false,
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
  permissions: string[]
): Promise<void> {
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  const validated = validatePermissionKeys(permissions)
  await store.updateStaffRow(userId, { permissions: validated })
}

/** Sets a new password for a staff member. The owner manages their own password. */
export async function resetStaffPassword(
  store: StaffStore,
  tenantId: string,
  userId: string,
  newPassword: string
): Promise<void> {
  assertValidPassword(newPassword)
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  await store.updateAuthPassword(userId, newPassword)
}

/** Deletes a staff account entirely (auth user cascade removes the app_users row). */
export async function removeStaff(
  store: StaffStore,
  tenantId: string,
  userId: string
): Promise<void> {
  const record = await findTenantStaff(store, tenantId, userId)
  assertNotOwner(record)
  await store.deleteAuthUser(userId)
}
