// Moving a store from one owner to another.
//
// Two writes with no transaction between them, so the order matters and so
// does the failure path: a handover that demotes and then fails to promote
// would leave the store with nobody able to manage staff — the exact state
// this whole feature exists to fix. The demote is therefore undone when the
// promote fails.
//
// Pure business logic over an injected store (the staff-service.ts pattern);
// the Supabase-backed store lives in the server action layer, which is the
// only place with service-role access.

import {
  DEMOTED_OWNER_PATCH,
  OWNER_PATCH,
  resolveOwnerTransfer,
  type OwnershipUser,
} from '@/lib/tenant-ownership'

export interface OwnershipStore {
  listTenantUsers(tenantId: string): Promise<OwnershipUser[]>
  updateUserRow(userId: string, patch: Record<string, unknown>): Promise<void>
}

/** Restores the owner we stood down, so a failed handover changes nothing. */
async function rollbackDemote(
  store: OwnershipStore,
  userId: string,
  cause: unknown
): Promise<never> {
  const causeMessage = cause instanceof Error ? cause.message : String(cause)
  try {
    await store.updateUserRow(userId, OWNER_PATCH)
  } catch (rollbackError) {
    const rollbackMessage =
      rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
    console.error('Ownership rollback failed; store may be left without an owner', {
      userId,
      causeMessage,
      rollbackMessage,
    })
    throw new Error(
      `${causeMessage} (ownership rollback also failed: ${rollbackMessage} — this store now has no owner)`
    )
  }
  throw cause instanceof Error ? cause : new Error(causeMessage)
}

/** Hands the store to `targetUserId`, standing the sitting owner down first. */
export async function transferOwnership(
  store: OwnershipStore,
  tenantId: string,
  targetUserId: string
): Promise<void> {
  const users = await store.listTenantUsers(tenantId)
  const { demote, promote } = resolveOwnerTransfer(users, targetUserId)

  if (demote) {
    await store.updateUserRow(demote, DEMOTED_OWNER_PATCH)
  }

  try {
    await store.updateUserRow(promote, OWNER_PATCH)
  } catch (error) {
    if (demote) return rollbackDemote(store, demote, error)
    throw error
  }
}
