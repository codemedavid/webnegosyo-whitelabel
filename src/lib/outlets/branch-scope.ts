/**
 * Which branch an account belongs to, and what that entitles it to.
 *
 * A merchant account can be locked to a single branch. The account is an
 * ordinary `role='admin'` row on `app_users`; the lock is one nullable
 * `outlet_id`. NULL means "every branch" — the meaning every account that
 * exists today already has — so no existing row changes behaviour.
 *
 * Two questions are answered here: whose orders an account may see, and whose
 * staff it may manage. Both are asked by the web admin, the merchant app, and
 * the POS, so they are decided once in a pure module the three surfaces share
 * (the same arrangement `staff-permissions.ts` uses) rather than in three sets
 * of conditionals that can drift apart.
 *
 * Nothing here queries or throws, except `resolveStaffOutletId`, which
 * validates untrusted form input and follows `validatePermissionKeys` in
 * throwing a message meant for the person who typed it.
 */

import {
  adminSectionForPath,
  hasPermission,
  type PermissionHolder,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import { getOrderOutletId, type OutletOrderLike } from './order-outlet-display'

/** The `app_users` fields that determine an account's branch. */
export interface BranchScopedUser {
  role: string
  is_owner?: boolean | null
  /** NULL/absent = every branch. */
  outlet_id?: string | null
}

/**
 * What an account can reach. `all` is today's behaviour and the default for
 * anything not deliberately locked down.
 */
export type BranchScope = { kind: 'all' } | { kind: 'branch'; outletId: string }

/** An actor asking to manage staff: permissions plus its own branch. */
export type BranchStaffActor = PermissionHolder & { outlet_id?: string | null }

/** Permission key granting a branch admin control of its own branch's staff. */
export const BRANCH_STAFF_PERMISSION: StaffPermissionKey = 'branch_staff'

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The branch an account is confined to, if any.
 *
 * Owners and superadmins are never confined: they are the accounts the
 * cross-branch views exist for. A blank id resolves to `all` rather than to a
 * branch named "" — a scope matching no order at all would read as a broken
 * account rather than a restricted one.
 */
export function resolveBranchScope(user: BranchScopedUser): BranchScope {
  if (user.role === 'superadmin' || user.is_owner) return { kind: 'all' }

  const outletId = trimmed(user.outlet_id)
  if (outletId === '') return { kind: 'all' }

  return { kind: 'branch', outletId }
}

/**
 * Whether this order is one the scope may see.
 *
 * The branch is read through `getOrderOutletId`, so the answer is the same
 * whether it arrived as an `orders.outlet_id` column (platform Supabase) or
 * inside `customer_data` (Convex and tenant-owned projects).
 *
 * An unattributed order is hidden from a branch account. It was not taken by
 * that branch, and a scope that leaked every pre-multi-branch order would not
 * be a scope. Those orders remain visible to the owner, who is the account
 * that can act on them.
 */
export function isOrderInScope<T extends object>(
  scope: BranchScope,
  order: T | null | undefined
): boolean {
  if (scope.kind === 'all') return true
  // `T` is `object` rather than `OutletOrderLike`: every field on that interface
  // is optional, making it a weak type that rejects concrete order rows with
  // "has no properties in common". The branch is read structurally instead.
  return getOrderOutletId(order as OutletOrderLike) === scope.outletId
}

/**
 * The orders a scope may see, in the order they arrived.
 *
 * An all-branch scope gets the caller's own array back rather than a copy: it
 * is by far the common case, and copying every page of a 2000-order window to
 * change nothing is waste. The branch case builds a new array and leaves the
 * input untouched.
 */
export function filterOrdersToScope<T extends OutletOrderLike>(
  scope: BranchScope,
  orders: readonly T[]
): readonly T[] {
  if (scope.kind === 'all') return orders
  return orders.filter((order) => isOrderInScope(scope, order))
}

/**
 * Whether this actor may create or edit a staff account at `targetOutletId`
 * (null meaning a tenant-wide account).
 *
 * Owners and superadmins may do anything, exactly as today. A branch admin —
 * a branch-locked account holding `branch_staff` — may manage only its own
 * branch, and may never create a tenant-wide account: that account would see
 * every branch, which is more than its creator has.
 *
 * A tenant-wide non-owner is refused outright. Staff management stays the
 * owner's; the branch grant is a narrow carve-out for one branch, not a second
 * owner.
 */
export function canManageBranchStaff(
  actor: BranchStaffActor,
  targetOutletId: string | null
): boolean {
  if (actor.role === 'superadmin' || actor.is_owner) return true
  if (actor.role !== 'admin') return false

  const actorOutletId = trimmed(actor.outlet_id)
  if (actorOutletId === '') return false

  if (!hasPermission(actor, BRANCH_STAFF_PERMISSION)) return false

  return trimmed(targetOutletId) === actorOutletId
}

/**
 * May this account create, rename, or deactivate a branch?
 *
 * Only a store-wide one. A branch manager is `role='admin'` plus an `outlet_id`
 * — a deliberate choice that kept every existing role check working — but it
 * means the tenant-admin grant on `outlets` reaches them too, and a manager of
 * one branch could rename or deactivate the others. The shape of the company is
 * the owner's; a branch account runs a branch.
 *
 * A blank id reads as store-wide, exactly as in `resolveBranchScope`: an account
 * must not be store-wide for reads and branch-locked for writes.
 *
 * This is the application half of the guard. The other half is the `outlets` RLS
 * policy, which is what actually stops a caller who skips the server action.
 */
export function canManageOutlets(user: BranchScopedUser): boolean {
  return isStoreWideAccount(user)
}

/**
 * May this account change what one branch sells — its listings, its prices,
 * what it has run out of?
 *
 * The mirror image of `canManageOutlets`, and deliberately more permissive.
 * Branch CRUD is store-wide-only because the shape of the company is the
 * owner's; the menu of the shop you actually run is not. Taking a sold-out dish
 * off your own board is the everyday reason per-branch menus exist, and routing
 * it through the owner would make the feature useless in the middle of service.
 *
 * A blank target is refused rather than read as "every branch": nothing legally
 * asks for a menu write against no branch, so a blank one is a bug upstream,
 * and the safe reading of a bug is no.
 *
 * The other half of the guard is `outlet_menu_items_write_admin`, which is what
 * stops a caller who skips the server action.
 */
export function canManageBranchMenu(user: BranchScopedUser, outletId: string): boolean {
  const target = trimmed(outletId)
  if (target === '') return false

  if (user.role === 'superadmin') return true
  if (user.role !== 'admin') return false

  const scope = resolveBranchScope(user)
  return scope.kind === 'all' || scope.outletId === target
}

/**
 * May this account see the store's branches at all — the directory, the
 * comparison table, the nav entry that leads to them?
 *
 * The same store-wide test as `canManageOutlets`, deliberately: a manager who
 * cannot rename South but can read its address, its opening hours and its
 * takings has still been shown the shape of the company. Naming the two rules
 * separately keeps the call sites honest about which one they are asking, and
 * lets them diverge if reading a branch list ever becomes something a manager
 * needs.
 */
export function canViewBranchDirectory(user: BranchScopedUser): boolean {
  return isStoreWideAccount(user)
}

/**
 * Whether the account runs the store rather than one of its branches.
 *
 * A blank id reads as store-wide, exactly as in `resolveBranchScope`: an
 * account must not be store-wide for reads and branch-locked for writes.
 */
function isStoreWideAccount(user: BranchScopedUser): boolean {
  if (user.role === 'superadmin' || user.is_owner) return true
  if (user.role !== 'admin') return false

  return trimmed(user.outlet_id) === ''
}

/** Admin sections only a store-wide account may open. */
const STORE_WIDE_ADMIN_SECTIONS: ReadonlySet<string> = new Set(['outlets'])

/**
 * Whether this admin pathname belongs to a section reserved for a store-wide
 * account.
 *
 * Section-level, not page-level: `/admin/outlets/<id>` is as much another
 * branch as the list it was linked from, and a gate that only knew the index
 * would be one guessed URL from useless.
 */
export function isStoreWideAdminPath(pathname: string): boolean {
  const section = adminSectionForPath(pathname)
  return section !== null && STORE_WIDE_ADMIN_SECTIONS.has(section)
}

/** The branch fields needed to validate an assignment against the tenant. */
export interface StaffOutletCandidate {
  id: string
}

/**
 * Validate an untrusted branch assignment into an id this tenant owns, or null
 * for a tenant-wide account.
 *
 * Absent, null, and empty all mean tenant-wide — the "All branches" option
 * submits an empty string. Anything else must name one of the tenant's own
 * branches; an id from elsewhere is a mis-scoped account, not a typo to
 * silently discard.
 */
export function resolveStaffOutletId(
  input: string | null | undefined,
  outlets: readonly StaffOutletCandidate[]
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
