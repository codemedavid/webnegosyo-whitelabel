import { describe, it, expect } from '@jest/globals'
import { canManageBranchMenu } from '@/lib/outlets/branch-scope'

/**
 * Who may change what a branch sells.
 *
 * Branch CRUD is store-wide-only (`canManageOutlets`) because the shape of the
 * company is the owner's. A branch's MENU is the opposite case: 86'ing a dish
 * at the shop you run is the everyday reason this feature exists, and routing
 * it through the owner would make the feature useless during a lunch rush.
 *
 * So the rule is: store-wide accounts manage any branch; a branch-scoped admin
 * manages its own branch and no other. Same predicate the RLS policy in
 * `20260806120000_outlet_menu_overrides.sql` enforces in the database.
 */

describe('canManageBranchMenu', () => {
  it('lets the owner manage any branch', () => {
    const owner = { role: 'admin', is_owner: true, outlet_id: null }

    expect(canManageBranchMenu(owner, 'branch-a')).toBe(true)
    expect(canManageBranchMenu(owner, 'branch-b')).toBe(true)
  })

  it('lets a superadmin manage any branch', () => {
    expect(canManageBranchMenu({ role: 'superadmin' }, 'branch-a')).toBe(true)
  })

  it('lets a store-wide admin manage any branch', () => {
    // Every account that exists today: no outlet_id at all.
    expect(canManageBranchMenu({ role: 'admin', outlet_id: null }, 'branch-a')).toBe(true)
  })

  it('lets a branch admin manage its own branch', () => {
    expect(canManageBranchMenu({ role: 'admin', outlet_id: 'branch-a' }, 'branch-a')).toBe(true)
  })

  it('refuses a branch admin another branch', () => {
    expect(canManageBranchMenu({ role: 'admin', outlet_id: 'branch-a' }, 'branch-b')).toBe(false)
  })

  it('refuses anyone who is not an admin', () => {
    expect(canManageBranchMenu({ role: 'customer', outlet_id: null }, 'branch-a')).toBe(false)
  })

  it('refuses a write that names no branch', () => {
    // A blank target is not "every branch" — it is a bug upstream, and the safe
    // reading of a bug is refusal.
    expect(canManageBranchMenu({ role: 'admin', outlet_id: null }, '')).toBe(false)
  })
})
