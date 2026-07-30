import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  canViewBranchDirectory,
  isStoreWideAdminPath,
} from '@/lib/outlets/branch-scope'
import { hiddenAdminSidebarPaths } from '@/lib/admin-sidebar-visibility'

/**
 * A branch manager must not see the other branches — nor the tab that lists
 * them.
 *
 * Writing was closed already (`outlets-manage-guard.test.ts`): a manager of
 * North could not rename South. Reading was not. The Branches sidebar entry
 * renders for every admin, `/admin/outlets` lists every outlet the tenant
 * owns, and the comparison table on that page names each one. A manager who
 * opens it learns the whole shape of the company, and — because the entry is
 * visible — is invited to.
 *
 * The rule is the one `canManageOutlets` already states: the company is the
 * owner's, a branch account runs a branch. So the same store-wide test decides
 * both, and the three layers that can leak it (nav entry, route, page) are
 * pinned here.
 */
describe('canViewBranchDirectory', () => {
  it('allows the owner', () => {
    expect(canViewBranchDirectory({ role: 'admin', is_owner: true })).toBe(true)
  })

  it('allows a superadmin', () => {
    expect(canViewBranchDirectory({ role: 'superadmin' })).toBe(true)
  })

  it('allows a store-wide admin', () => {
    // Arrange: every account that predates branches is this one. The branch
    // directory is what it has always seen.
    expect(canViewBranchDirectory({ role: 'admin', is_owner: false, outlet_id: null })).toBe(
      true
    )
  })

  it('refuses a branch-scoped admin', () => {
    // Arrange: the manager of North, asking to see South.
    expect(
      canViewBranchDirectory({ role: 'admin', is_owner: false, outlet_id: 'outlet-north' })
    ).toBe(false)
  })

  it('treats a blank branch as store-wide, matching resolveBranchScope', () => {
    expect(canViewBranchDirectory({ role: 'admin', is_owner: false, outlet_id: '  ' })).toBe(
      true
    )
  })
})

describe('isStoreWideAdminPath', () => {
  it('claims the branches section', () => {
    expect(isStoreWideAdminPath('/acme/admin/outlets')).toBe(true)
  })

  it('claims a page nested under it', () => {
    // A manager blocked from the list but not from `/outlets/<id>` would still
    // be able to read another branch by guessing one URL.
    expect(isStoreWideAdminPath('/acme/admin/outlets/outlet-south')).toBe(true)
  })

  it('leaves every other admin section alone', () => {
    // Orders, menu, and the rest are branch-scoped elsewhere; this gate must
    // not start bouncing a manager out of the app.
    expect(isStoreWideAdminPath('/acme/admin/orders')).toBe(false)
    expect(isStoreWideAdminPath('/acme/admin')).toBe(false)
    expect(isStoreWideAdminPath('/acme/menu')).toBe(false)
  })
})

describe('hiddenAdminSidebarPaths — branch-scoped account', () => {
  it('hides Branches from a branch manager even with multi-branch on', () => {
    const hidden = hiddenAdminSidebarPaths({
      multiBranchEnabled: true,
      isBranchScopedAccount: true,
    })

    expect(hidden.has('/outlets')).toBe(true)
  })

  it('keeps Branches for a store-wide account, as today', () => {
    const hidden = hiddenAdminSidebarPaths({
      multiBranchEnabled: true,
      isBranchScopedAccount: false,
    })

    expect(hidden.has('/outlets')).toBe(false)
  })

  it('hides nothing else because of the branch lock', () => {
    // Regression lock: the branch rule owns exactly one entry. A manager still
    // runs a shift, so orders, menu, and stock stay where they are.
    const storeWide = hiddenAdminSidebarPaths({
      enableOrderManagement: true,
      menuEngineeringEnabled: true,
      bundlesEnabled: true,
      convexConfigured: true,
      inventoryEnabled: true,
      multiBranchEnabled: true,
    })
    const branchScoped = hiddenAdminSidebarPaths({
      enableOrderManagement: true,
      menuEngineeringEnabled: true,
      bundlesEnabled: true,
      convexConfigured: true,
      inventoryEnabled: true,
      multiBranchEnabled: true,
      isBranchScopedAccount: true,
    })

    expect(storeWide).toEqual(new Set())
    expect(branchScoped).toEqual(new Set(['/outlets']))
  })

  it('reads an absent branch lock as store-wide', () => {
    // The flag is optional so every existing caller keeps its behaviour.
    expect(hiddenAdminSidebarPaths({ multiBranchEnabled: true }).has('/outlets')).toBe(false)
  })
})

/**
 * The nav entry is only the invitation. These three source guardrails pin the
 * wiring that actually carries the account's branch to each layer — a rule
 * that is correct but never asked would hide nothing.
 */
describe('web admin wiring', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

  it('carries the caller branch from the admin layout', () => {
    // `getCachedCurrentUserRole` already reads outlet_id; the layout dropped
    // it when building the caller, so nothing downstream could see it.
    expect(read('src/app/[tenant]/admin/layout.tsx')).toMatch(/outlet_id/)
  })

  it('decides the sidebar entry from the caller branch', () => {
    expect(read('src/components/admin/admin-layout-client.tsx')).toMatch(
      /canViewBranchDirectory/
    )
  })

  it('bounces a branch manager off the branches route in middleware', () => {
    // The nav entry can be skipped by typing the URL. Middleware is the layer
    // a caller cannot route around.
    const source = read('src/middleware.ts')
    expect(source).toMatch(/isStoreWideAdminPath/)
    expect(source).toMatch(/canViewBranchDirectory/)
  })

  it('refuses to render the branches page for a branch manager', () => {
    // Defence in depth: middleware does not run for every rendering path
    // (server actions, direct RSC requests), and this page names every branch.
    expect(read('src/app/[tenant]/admin/outlets/page.tsx')).toMatch(
      /canViewBranchDirectory/
    )
  })
})
