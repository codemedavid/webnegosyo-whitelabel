import { describe, it, expect } from '@jest/globals'
import {
  resolveBranchScope,
  isOrderInScope,
  filterOrdersToScope,
  canManageBranchStaff,
  resolveStaffOutletId,
  type BranchScopedUser,
} from '@/lib/outlets/branch-scope'

/**
 * A merchant account can now be locked to one branch. The account itself is
 * unchanged — still `role='admin'` on `app_users` — and the lock is a single
 * nullable `outlet_id`. NULL means "every branch", which is what every account
 * that exists today means, so an untouched row keeps seeing the whole business.
 *
 * Everything here decides two questions: whose orders an account may see, and
 * whose staff it may manage. Both are asked on the web admin, in the merchant
 * app, and at the POS, so the answers live in one pure module the three
 * surfaces share rather than in three sets of `if`s.
 */

const owner: BranchScopedUser = { role: 'admin', is_owner: true, outlet_id: null }
const superadmin: BranchScopedUser = { role: 'superadmin', is_owner: false, outlet_id: null }
const legacyStaff: BranchScopedUser = { role: 'admin', is_owner: false, outlet_id: null }
const branchStaff: BranchScopedUser = { role: 'admin', is_owner: false, outlet_id: 'outlet-north' }

describe('resolveBranchScope', () => {
  it('gives the tenant owner every branch', () => {
    expect(resolveBranchScope(owner)).toEqual({ kind: 'all' })
  })

  it('gives a platform superadmin every branch', () => {
    expect(resolveBranchScope(superadmin)).toEqual({ kind: 'all' })
  })

  it('gives an account with no branch every branch (every row that exists today)', () => {
    expect(resolveBranchScope(legacyStaff)).toEqual({ kind: 'all' })
  })

  it('treats a missing outlet_id the same as null', () => {
    expect(resolveBranchScope({ role: 'admin', is_owner: false })).toEqual({ kind: 'all' })
  })

  it('locks a branch-scoped staff account to its own branch', () => {
    expect(resolveBranchScope(branchStaff)).toEqual({ kind: 'branch', outletId: 'outlet-north' })
  })

  it('ignores a blank outlet_id rather than locking the account to ""', () => {
    // A blank scope would match no order at all and read as a broken account.
    expect(resolveBranchScope({ role: 'admin', is_owner: false, outlet_id: '  ' })).toEqual({
      kind: 'all',
    })
  })

  it('lets the owner flag win over a stray branch assignment', () => {
    // The DB CHECK forbids this pairing; if one appears anyway, the owner keeps
    // the whole business rather than being silently demoted to one branch.
    const strayed: BranchScopedUser = { role: 'admin', is_owner: true, outlet_id: 'outlet-north' }
    expect(resolveBranchScope(strayed)).toEqual({ kind: 'all' })
  })
})

describe('isOrderInScope', () => {
  const all = { kind: 'all' } as const
  const north = { kind: 'branch', outletId: 'outlet-north' } as const

  it('shows every order to an all-branch account', () => {
    expect(isOrderInScope(all, { outlet_id: 'outlet-south' })).toBe(true)
  })

  it('shows an unattributed order to an all-branch account', () => {
    expect(isOrderInScope(all, { outlet_id: null })).toBe(true)
  })

  it('shows a branch account its own order', () => {
    expect(isOrderInScope(north, { outlet_id: 'outlet-north' })).toBe(true)
  })

  it("hides another branch's order", () => {
    expect(isOrderInScope(north, { outlet_id: 'outlet-south' })).toBe(false)
  })

  it('hides an unattributed order from a branch account', () => {
    // It was not taken by this branch. Showing it would defeat the scope.
    expect(isOrderInScope(north, { outlet_id: null })).toBe(false)
  })

  it('reads the branch out of customer_data when there is no column (Convex path)', () => {
    // Convex and tenant-owned Supabase projects carry the branch in
    // customer_data; the scope has to hold on those backends too.
    expect(isOrderInScope(north, { customer_data: { outlet_id: 'outlet-north' } })).toBe(true)
    expect(isOrderInScope(north, { customer_data: { outlet_id: 'outlet-south' } })).toBe(false)
  })

  it('hides an order with malformed branch data from a branch account', () => {
    expect(isOrderInScope(north, { customer_data: { outlet_id: 42 } })).toBe(false)
  })

  it('hides a null order from a branch account instead of throwing', () => {
    expect(isOrderInScope(north, null)).toBe(false)
  })
})

describe('filterOrdersToScope', () => {
  const orders = [
    { id: '1', outlet_id: 'outlet-north' },
    { id: '2', outlet_id: 'outlet-south' },
    { id: '3', outlet_id: null },
    { id: '4', customer_data: { outlet_id: 'outlet-north' } },
  ]

  it('returns every order unchanged for an all-branch account', () => {
    const result = filterOrdersToScope({ kind: 'all' }, orders)
    expect(result).toEqual(orders)
  })

  it('returns the same array reference for an all-branch account', () => {
    // The overwhelmingly common case must not copy a 2000-order page.
    const result = filterOrdersToScope({ kind: 'all' }, orders)
    expect(result).toBe(orders)
  })

  it('keeps only the branch account own orders, in order', () => {
    const result = filterOrdersToScope({ kind: 'branch', outletId: 'outlet-north' }, orders)
    expect(result.map((o) => o.id)).toEqual(['1', '4'])
  })

  it('does not mutate the caller list', () => {
    const input = [...orders]
    filterOrdersToScope({ kind: 'branch', outletId: 'outlet-north' }, input)
    expect(input).toEqual(orders)
  })

  it('returns an empty list rather than throwing when nothing matches', () => {
    expect(filterOrdersToScope({ kind: 'branch', outletId: 'outlet-west' }, orders)).toEqual([])
  })
})

describe('canManageBranchStaff', () => {
  it('lets the owner manage staff at any branch', () => {
    expect(canManageBranchStaff(owner, 'outlet-north')).toBe(true)
  })

  it('lets the owner manage tenant-wide staff', () => {
    expect(canManageBranchStaff(owner, null)).toBe(true)
  })

  it('lets a superadmin manage staff at any branch', () => {
    expect(canManageBranchStaff(superadmin, 'outlet-south')).toBe(true)
  })

  it('lets a branch admin manage staff at its own branch', () => {
    const branchAdmin = {
      role: 'admin',
      is_owner: false,
      outlet_id: 'outlet-north',
      permissions: ['orders', 'branch_staff'],
    }
    expect(canManageBranchStaff(branchAdmin, 'outlet-north')).toBe(true)
  })

  it("refuses a branch admin another branch's staff", () => {
    const branchAdmin = {
      role: 'admin',
      is_owner: false,
      outlet_id: 'outlet-north',
      permissions: ['orders', 'branch_staff'],
    }
    expect(canManageBranchStaff(branchAdmin, 'outlet-south')).toBe(false)
  })

  it('refuses a branch admin tenant-wide staff', () => {
    // A tenant-wide account outranks its creator: it would see every branch.
    const branchAdmin = {
      role: 'admin',
      is_owner: false,
      outlet_id: 'outlet-north',
      permissions: ['branch_staff'],
    }
    expect(canManageBranchStaff(branchAdmin, null)).toBe(false)
  })

  it('refuses branch staff without the branch_staff permission', () => {
    const staff = {
      role: 'admin',
      is_owner: false,
      outlet_id: 'outlet-north',
      permissions: ['orders'],
    }
    expect(canManageBranchStaff(staff, 'outlet-north')).toBe(false)
  })

  it('refuses a tenant-wide non-owner account even with the permission', () => {
    // Staff management stays the owner's, exactly as it is today; the branch
    // grant is a narrow carve-out for one branch, not a second owner.
    const staff = { role: 'admin', is_owner: false, outlet_id: null, permissions: ['branch_staff'] }
    expect(canManageBranchStaff(staff, 'outlet-north')).toBe(false)
  })

  it('refuses a customer', () => {
    expect(canManageBranchStaff({ role: 'customer', is_owner: false }, 'outlet-north')).toBe(false)
  })
})

describe('resolveStaffOutletId', () => {
  const outlets = [
    { id: 'outlet-north', tenant_id: 'tenant-1' },
    { id: 'outlet-south', tenant_id: 'tenant-1' },
  ]

  it('accepts a branch belonging to the tenant', () => {
    expect(resolveStaffOutletId('outlet-north', outlets)).toBe('outlet-north')
  })

  it('reads null as tenant-wide', () => {
    expect(resolveStaffOutletId(null, outlets)).toBeNull()
  })

  it('reads undefined as tenant-wide', () => {
    expect(resolveStaffOutletId(undefined, outlets)).toBeNull()
  })

  it('reads an empty string as tenant-wide (the "All branches" option)', () => {
    expect(resolveStaffOutletId('', outlets)).toBeNull()
  })

  it('trims a padded id', () => {
    expect(resolveStaffOutletId(' outlet-south ', outlets)).toBe('outlet-south')
  })

  it("rejects another tenant's branch", () => {
    expect(() => resolveStaffOutletId('outlet-elsewhere', outlets)).toThrow(
      /branch/i
    )
  })

  it('rejects a non-string branch id', () => {
    expect(() => resolveStaffOutletId(42 as unknown as string, outlets)).toThrow(/branch/i)
  })
})
