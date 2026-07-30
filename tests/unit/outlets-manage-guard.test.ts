import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import { canManageOutlets } from '@/lib/outlets/branch-scope'

/**
 * Who may create, rename, or deactivate a branch.
 *
 * A branch manager is deliberately not a new role — it is `role='admin'` plus an
 * `outlet_id` (see `20260802120000`). That decision kept every existing RLS
 * policy, middleware check, and admin test working untouched, but it has one
 * consequence that was never followed up: `outlets_write_admin` grants FOR ALL
 * to any `role='admin'` in the tenant, so a manager of one branch can currently
 * rename or deactivate every OTHER branch, including ones they do not run.
 *
 * Managing the shape of the company is the owner's. A branch account runs a
 * branch.
 */
describe('canManageOutlets', () => {
  it('allows the owner', () => {
    // Act
    const allowed = canManageOutlets({ role: 'admin', is_owner: true })

    // Assert
    expect(allowed).toBe(true)
  })

  it('allows a superadmin', () => {
    // Act
    const allowed = canManageOutlets({ role: 'superadmin' })

    // Assert
    expect(allowed).toBe(true)
  })

  it('allows a store-wide admin', () => {
    // Arrange: every account that existed before branches is this one, so it
    // must keep the access it has today.
    const allowed = canManageOutlets({ role: 'admin', is_owner: false, outlet_id: null })

    // Assert
    expect(allowed).toBe(true)
  })

  it('refuses a branch-scoped admin', () => {
    // Arrange: the live gap. A manager of North could deactivate South.
    const allowed = canManageOutlets({
      role: 'admin',
      is_owner: false,
      outlet_id: 'outlet-north',
    })

    // Assert
    expect(allowed).toBe(false)
  })

  it('refuses a customer', () => {
    // Act
    const allowed = canManageOutlets({ role: 'customer' })

    // Assert
    expect(allowed).toBe(false)
  })

  it('treats a blank branch as store-wide, matching resolveBranchScope', () => {
    // Arrange: a blank id resolves to `all` everywhere else in this module. If
    // it resolved differently here, an account would be store-wide for reads
    // and branch-locked for writes.
    const allowed = canManageOutlets({ role: 'admin', is_owner: false, outlet_id: '   ' })

    // Assert
    expect(allowed).toBe(true)
  })
})

/**
 * The rule has to be enforced somewhere the caller cannot skip. The outlets
 * actions previously relied on RLS alone — and RLS is precisely what was too
 * permissive here, so "the policy will catch it" was never true.
 */
describe('outlets server actions', () => {
  const source = () =>
    readFileSync(join(process.cwd(), 'src/app/actions/outlets.ts'), 'utf8')

  it('checks the caller may manage branches before writing', () => {
    expect(source()).toMatch(/canManageOutlets/)
  })

  it('reads the caller from the session, not from an argument', () => {
    // A tenantId passed in by the client says nothing about who is calling.
    expect(source()).toMatch(/fetchAppUserScope/)
  })

  it('leaves the read path ungated', () => {
    // Listing branches is what the branch picker and every order screen do; a
    // manager must still be able to see the store's branches.
    expect(source()).toMatch(/export async function listOutletsAction/)
  })
})
