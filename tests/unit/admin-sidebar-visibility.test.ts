import { describe, it, expect } from '@jest/globals'
import {
  hiddenAdminSidebarPaths,
  isHiddenAdminHref,
  type AdminSidebarFlags,
} from '@/lib/admin-sidebar-visibility'

/**
 * This module is a pure extraction of the filtering the admin sidebar already
 * did inline. The first block below is a regression lock: it pins the exact
 * hidden-path set today's flag combinations produce, so adding the Branches
 * entry cannot quietly change what an existing tenant sees.
 */

const flags = (overrides: Partial<AdminSidebarFlags> = {}): AdminSidebarFlags => ({ ...overrides })

describe('hiddenAdminSidebarPaths — existing behaviour (regression lock)', () => {
  it('hides the opt-in sections for a tenant with no flags set at all', () => {
    expect(hiddenAdminSidebarPaths(flags())).toEqual(
      new Set(['/boost-sales', '/product-analytics', '/bundles', '/inventory', '/outlets'])
    )
  })

  it('hides nothing extra for a tenant with every existing feature on', () => {
    const hidden = hiddenAdminSidebarPaths(
      flags({
        enableOrderManagement: true,
        menuEngineeringEnabled: true,
        bundlesEnabled: true,
        convexConfigured: true,
        inventoryEnabled: true,
        multiBranchEnabled: true,
      })
    )
    expect(hidden).toEqual(new Set())
  })

  it('hides orders only when order management is explicitly switched off', () => {
    // Strictly `false`, not merely falsy: an undefined flag has always meant
    // "show orders", and existing tenant rows predate the column.
    expect(hiddenAdminSidebarPaths(flags({ enableOrderManagement: false })).has('/orders')).toBe(
      true
    )
    expect(
      hiddenAdminSidebarPaths(flags({ enableOrderManagement: undefined })).has('/orders')
    ).toBe(false)
  })

  it('keeps product analytics visible without menu engineering when Convex is configured', () => {
    const hidden = hiddenAdminSidebarPaths(
      flags({ menuEngineeringEnabled: false, convexConfigured: true })
    )
    expect(hidden.has('/product-analytics')).toBe(false)
    expect(hidden.has('/boost-sales')).toBe(true)
  })

  it('hides product analytics when neither menu engineering nor Convex is available', () => {
    expect(
      hiddenAdminSidebarPaths(flags({ menuEngineeringEnabled: false, convexConfigured: false })).has(
        '/product-analytics'
      )
    ).toBe(true)
  })

  it('hides bundles and inventory when their flags are off', () => {
    const hidden = hiddenAdminSidebarPaths(flags({ bundlesEnabled: false, inventoryEnabled: false }))
    expect(hidden.has('/bundles')).toBe(true)
    expect(hidden.has('/inventory')).toBe(true)
  })
})

describe('hiddenAdminSidebarPaths — branches', () => {
  it('hides Branches when multi-branch has never been switched on', () => {
    expect(hiddenAdminSidebarPaths(flags()).has('/outlets')).toBe(true)
  })

  it('hides Branches when the flag is explicitly false', () => {
    expect(hiddenAdminSidebarPaths(flags({ multiBranchEnabled: false })).has('/outlets')).toBe(true)
  })

  it('hides Branches when the flag is null on an older tenant row', () => {
    expect(hiddenAdminSidebarPaths(flags({ multiBranchEnabled: null })).has('/outlets')).toBe(true)
  })

  it('shows Branches once multi-branch is on', () => {
    expect(hiddenAdminSidebarPaths(flags({ multiBranchEnabled: true })).has('/outlets')).toBe(false)
  })
})

describe('isHiddenAdminHref', () => {
  const hidden = hiddenAdminSidebarPaths(flags())

  it('hides a tenant-prefixed href for a hidden section', () => {
    expect(isHiddenAdminHref('/my-resto/admin/outlets', hidden)).toBe(true)
  })

  it('keeps an href for a section that is not hidden', () => {
    expect(isHiddenAdminHref('/my-resto/admin/menu', hidden)).toBe(false)
  })

  it('does not let the Branches rule swallow the Orders entry', () => {
    // Both live under /admin and the matcher is substring-based; '/outlets' and
    // '/orders' must not overlap in either direction.
    const all = hiddenAdminSidebarPaths(flags({ enableOrderManagement: false }))
    expect(isHiddenAdminHref('/my-resto/admin/outlets', all)).toBe(true)
    expect(isHiddenAdminHref('/my-resto/admin/orders', all)).toBe(true)
    expect(isHiddenAdminHref('/my-resto/admin/order-types', all)).toBe(false)
  })

  it('keeps every entry when nothing is hidden', () => {
    expect(isHiddenAdminHref('/my-resto/admin/outlets', new Set())).toBe(false)
  })
})

describe('transfers', () => {
  it('is hidden for a store with inventory but only one branch', () => {
    // One branch cannot transfer to itself. Offering the entry leads to a
    // screen that can only explain why it is empty.
    const hidden = hiddenAdminSidebarPaths({ inventoryEnabled: true, multiBranchEnabled: false })

    expect(isHiddenAdminHref('/demo/admin/inventory/transfers', hidden)).toBe(true)
  })

  it('leaves inventory itself visible for that store', () => {
    // The gate is on transfers alone; a single-shop store still runs inventory.
    const hidden = hiddenAdminSidebarPaths({ inventoryEnabled: true, multiBranchEnabled: false })

    expect(isHiddenAdminHref('/demo/admin/inventory', hidden)).toBe(false)
  })

  it('is offered to a store with both branches and inventory', () => {
    const hidden = hiddenAdminSidebarPaths({ inventoryEnabled: true, multiBranchEnabled: true })

    expect(isHiddenAdminHref('/demo/admin/inventory/transfers', hidden)).toBe(false)
  })

  it('is hidden when inventory is off, branches or not', () => {
    const hidden = hiddenAdminSidebarPaths({ inventoryEnabled: false, multiBranchEnabled: true })

    expect(isHiddenAdminHref('/demo/admin/inventory/transfers', hidden)).toBe(true)
  })

  it('stays available to a branch manager, who is the one counting deliveries in', () => {
    // Unlike /outlets, this is not a store-wide list — it is the manager's own
    // bench. Hiding it would leave a delivery with nobody able to record it.
    const hidden = hiddenAdminSidebarPaths({
      inventoryEnabled: true,
      multiBranchEnabled: true,
      isBranchScopedAccount: true,
    })

    expect(isHiddenAdminHref('/demo/admin/inventory/transfers', hidden)).toBe(false)
  })
})
