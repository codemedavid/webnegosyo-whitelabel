/**
 * Who may see and do what on the Inventory screen (plan §6, Phase 0d).
 *
 * `menu` keeps the ingredient master and recipes, `inventory` the stock work,
 * `costs` every peso figure, and `reports` the takings. The page computes this
 * ONCE from the caller and every surface below reads it — and it decides which
 * reads the page makes at all, so an inventory-only clerk never triggers a
 * `menu`-gated seed (which throws) or a revenue read they may not see.
 */

import {
  FULL_INVENTORY_ACCESS,
  planInventoryReads,
  resolveInventoryAccess,
} from '@/components/admin/inventory-manager/inventory-access'

const staff = (permissions: string[] | null) => ({ role: 'admin', is_owner: false, permissions })

describe('resolveInventoryAccess', () => {
  it('gives an owner every capability', () => {
    expect(resolveInventoryAccess({ role: 'admin', is_owner: true, permissions: [] })).toEqual(
      FULL_INVENTORY_ACCESS,
    )
  })

  it('treats NULL permissions as full access, like every other gate', () => {
    expect(resolveInventoryAccess(staff(null))).toEqual(FULL_INVENTORY_ACCESS)
  })

  it('maps each key to its own capability for a scoped account', () => {
    expect(resolveInventoryAccess(staff(['inventory']))).toEqual({
      canEditMaster: false,
      canManageStock: true,
      canSeeCosts: false,
      canSeeSales: false,
    })
    expect(resolveInventoryAccess(staff(['menu', 'costs']))).toEqual({
      canEditMaster: true,
      canManageStock: false,
      canSeeCosts: true,
      canSeeSales: false,
    })
  })

  it('lets analytics imply sales figures, as the registry does', () => {
    expect(resolveInventoryAccess(staff(['inventory', 'analytics'])).canSeeSales).toBe(true)
  })

  it('fails closed when the caller could not be read', () => {
    expect(resolveInventoryAccess(null)).toEqual({
      canEditMaster: false,
      canManageStock: false,
      canSeeCosts: false,
      canSeeSales: false,
    })
  })
})

describe('planInventoryReads', () => {
  it('seeds units only for an account that may create them', () => {
    expect(planInventoryReads(resolveInventoryAccess(staff(['inventory']))).shouldSeedUnits).toBe(false)
    expect(planInventoryReads(resolveInventoryAccess(staff(['menu']))).shouldSeedUnits).toBe(true)
  })

  it('reads the daily report only with costs', () => {
    expect(planInventoryReads(resolveInventoryAccess(staff(['inventory']))).shouldReadDailyReport).toBe(false)
    expect(
      planInventoryReads(resolveInventoryAccess(staff(['inventory', 'costs']))).shouldReadDailyReport,
    ).toBe(true)
  })

  it('reads the takings only with BOTH reports and costs', () => {
    const read = (keys: string[]) => planInventoryReads(resolveInventoryAccess(staff(keys))).shouldReadRevenue
    expect(read(['inventory', 'costs'])).toBe(false)
    expect(read(['inventory', 'reports'])).toBe(false)
    expect(read(['inventory', 'reports', 'costs'])).toBe(true)
  })

  it('reads everything for an owner', () => {
    expect(planInventoryReads(FULL_INVENTORY_ACCESS)).toEqual({
      shouldSeedUnits: true,
      shouldReadDailyReport: true,
      shouldReadRevenue: true,
    })
  })
})
