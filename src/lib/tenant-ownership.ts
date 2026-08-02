// Who owns a store, and what it takes to change that.
//
// The owner flag is not decoration: `hasPermission` and `canManageStaff` in
// staff-permissions.ts both short-circuit on it, and `resolveBranchScope`
// treats an owner as unconfined. A tenant with no owner therefore cannot add
// staff at all — which is exactly the state every tenant created through the
// superadmin panel has been left in, because that path never set the flag.
//
// The rules live here as pure functions, apart from the server action that
// applies them, so the "one owner, transferred not duplicated" invariant can
// be tested without a database (same shape as staff-service.ts).

/** The `app_users` fields ownership decisions read. A superset is fine. */
export interface OwnershipUser {
  user_id: string
  role: string
  is_owner: boolean
  /** NULL/absent = the whole store. */
  outlet_id?: string | null
}

/**
 * An ownership change, as the two writes it takes.
 *
 * Ordered deliberately: the sitting owner is stood down before the new one is
 * raised, so a unique-owner index never sees two at once.
 */
export interface OwnerTransfer {
  /** The sitting owner to stand down, or null when the store has none. */
  demote: string | null
  promote: string
}

/**
 * What an account becomes when it takes the store.
 *
 * `permissions: null` reads as full access everywhere, and the branch is
 * cleared because an owner is never confined to one — the 20260802120000
 * CHECK constraint permits `outlet_id` only while `is_owner` is false.
 */
export const OWNER_PATCH = {
  is_owner: true,
  permissions: null,
  outlet_id: null,
} as const

/**
 * What a former owner becomes.
 *
 * Only the flag is dropped. Stripping their permissions in the same breath
 * would turn a handover into a lockout, which is not what was asked for.
 */
export const DEMOTED_OWNER_PATCH = { is_owner: false } as const

/**
 * The account that owns this store, if one does.
 *
 * Generic so callers get their own row type back — the superadmin list needs
 * the owner's email to name them, and narrowing to `OwnershipUser` would hide
 * it behind a cast.
 */
export function findTenantOwner<T extends OwnershipUser>(users: readonly T[]): T | null {
  return users.find((user) => user.is_owner) ?? null
}

/**
 * Whether this store has people but nobody in charge.
 *
 * An empty tenant is not ownerless — it is simply unstaffed, and warning
 * about it would fire on every store the moment it is created.
 */
export function isTenantOwnerless(users: readonly OwnershipUser[]): boolean {
  return users.length > 0 && findTenantOwner(users) === null
}

/** Guards the "one owner per store" rule at the point a new one is added. */
export function assertCanAddOwner(users: readonly OwnershipUser[]): void {
  if (findTenantOwner(users) === null) return
  throw new Error('This store already has an owner — transfer ownership instead')
}

/** The two writes that move ownership to `targetUserId`. */
export function resolveOwnerTransfer(
  users: readonly OwnershipUser[],
  targetUserId: string
): OwnerTransfer {
  const target = users.find((user) => user.user_id === targetUserId)
  if (!target) {
    throw new Error('That account was not found on this store')
  }
  if (target.is_owner) {
    throw new Error('That account already owns this store')
  }
  if (target.role !== 'admin') {
    throw new Error('Only an admin account of this store can be made its owner')
  }

  return { demote: findTenantOwner(users)?.user_id ?? null, promote: targetUserId }
}

/**
 * Blocks the removal that would leave a staffed store with nobody in charge.
 *
 * Removing the last account of all is allowed: that is closing the store, not
 * orphaning it, and refusing would make a tenant impossible to clean up.
 */
export function assertNotLastOwner(users: readonly OwnershipUser[], userId: string): void {
  const target = users.find((user) => user.user_id === userId)
  if (!target?.is_owner) return

  const remaining = users.filter((user) => user.user_id !== userId)
  if (remaining.length === 0) return

  throw new Error(
    'Transfer ownership to another admin before removing the owner of this store'
  )
}
