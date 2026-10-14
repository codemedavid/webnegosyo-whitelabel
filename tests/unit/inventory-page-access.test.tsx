/**
 * Phase 0d — the Inventory page reads only what the account may use (plan §6).
 *
 * The route now opens to `inventory` holders who need not hold `menu`. The page
 * used to seed the default units on every visit, a `menu`-gated write that
 * THROWS for such an account — the whole page went down. It also read the
 * priced daily report and the day's takings for everyone. Each read is now
 * decided by the caller's keys, and the screen is told what it may show.
 */

import { render } from '@testing-library/react'
import type { InventoryAccess } from '@/components/admin/inventory-manager/inventory-access'

const mockCaller = jest.fn()
const mockSeedDefaultUnits = jest.fn()
const mockGetUnits = jest.fn()
const mockGetDailyInventoryReport = jest.fn()
const mockGetDailyRevenue = jest.fn()
const mockManagerProps = jest.fn()

const TENANT = {
  id: 't1',
  slug: 'demo',
  inventory_enabled: true,
  order_backend: 'platform',
  low_stock_alerts_enabled: false,
  auto_86_enabled: false,
}
const UNITS = [{ id: 'u1', abbreviation: 'kg' }]
const REPORT = { dayKey: '2026-10-13', rows: [], totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 } }

jest.mock('next/navigation', () => ({ notFound: jest.fn() }))
jest.mock('@/components/shared/breadcrumbs', () => ({ Breadcrumbs: () => null }))
jest.mock('@/components/admin/stock-alerts-banner', () => ({ StockAlertsBanner: () => null }))
jest.mock('@/components/admin/stock-reconciliation-banner', () => ({ StockReconciliationBanner: () => null }))
jest.mock('@/components/admin/inventory-manager', () => ({
  InventoryManager: (props: unknown) => {
    mockManagerProps(props)
    return null
  },
}))
jest.mock('@/lib/cache', () => ({
  getCachedTenantBySlug: async () => TENANT,
  getCachedCurrentUserRole: async () => mockCaller(),
}))
jest.mock('@/lib/inventory/units-service', () => ({
  seedDefaultUnits: (...a: unknown[]) => mockSeedDefaultUnits(...a),
  getUnits: (...a: unknown[]) => mockGetUnits(...a),
}))
jest.mock('@/lib/inventory/branch-stock-read', () => ({
  getScopedIngredients: async () => [],
  getBranchStockSummaries: async () => ({}),
}))
jest.mock('@/lib/inventory/reconciliation', () => ({ getStockReconciliationIssues: async () => [] }))
jest.mock('@/lib/inventory/stock-alerts-read', () => ({ getOpenStockAlerts: async () => [] }))
jest.mock('@/lib/inventory/last-purchase', () => ({ getCachedLastPurchaseDates: async () => ({}) }))
jest.mock('@/lib/inventory/recipe-coverage-read', () => ({
  getRecipeCoverage: async () => ({
    coverageRows: [],
    recipeComponents: [],
    menuItems: [],
    recipes: [],
    loadFailed: false,
  }),
}))
jest.mock('@/lib/inventory/activity-feed-read', () => ({
  getInventoryActivity: async () => ({ entries: [], loadFailed: false }),
}))
jest.mock('@/lib/inventory/daily-report-read', () => ({
  getDailyInventoryReport: (...a: unknown[]) => mockGetDailyInventoryReport(...a),
}))
jest.mock('@/lib/inventory/daily-revenue-read', () => ({
  getDailyRevenue: (...a: unknown[]) => mockGetDailyRevenue(...a),
}))
jest.mock('@/lib/inventory/count-session-service', () => ({
  getOpenCount: async () => null,
  getAnyOpenCount: async () => null,
  getCountProgress: async () => null,
}))
jest.mock('@/lib/outlets/supabase-outlet-repository', () => ({
  createSupabaseOutletRepository: () => ({ listByTenant: async () => [] }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({}),
  mergeTenantSecrets: (tenant: unknown) => tenant,
}))

// next/jest leaves static imports ahead of jest.mock, so import lazily.
async function renderPage() {
  const { default: AdminInventoryPage } = jest.requireActual(
    '@/app/[tenant]/admin/inventory/page',
  ) as typeof import('@/app/[tenant]/admin/inventory/page')
  const page = await AdminInventoryPage({
    params: Promise.resolve({ tenant: 'demo' }),
    searchParams: Promise.resolve({}),
  })
  render(page)
  return mockManagerProps.mock.calls.at(-1)?.[0] as {
    access: InventoryAccess
    initialUnits: unknown
    dailyReport?: unknown
    dailyRevenue?: number | null
    isSalesWithheld?: boolean
  }
}

const staff = (permissions: string[]) => ({
  role: 'admin',
  tenant_id: 't1',
  is_owner: false,
  permissions,
  outlet_id: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSeedDefaultUnits.mockResolvedValue(UNITS)
  mockGetUnits.mockResolvedValue(UNITS)
  mockGetDailyInventoryReport.mockResolvedValue(REPORT)
  mockGetDailyRevenue.mockResolvedValue(1000)
})

describe('Inventory page — reads follow the account', () => {
  it('renders for an inventory-only account without the menu-gated seed', async () => {
    mockCaller.mockReturnValue(staff(['inventory']))

    const props = await renderPage()

    expect(mockSeedDefaultUnits).not.toHaveBeenCalled()
    expect(mockGetUnits).toHaveBeenCalledWith('t1')
    expect(props.initialUnits).toEqual(UNITS)
  })

  it('reads neither the priced report nor the takings without costs', async () => {
    mockCaller.mockReturnValue(staff(['inventory']))

    const props = await renderPage()

    expect(mockGetDailyInventoryReport).not.toHaveBeenCalled()
    expect(mockGetDailyRevenue).not.toHaveBeenCalled()
    expect(props.dailyReport).toBeUndefined()
  })

  it('reads the report but not the takings with costs and no reports', async () => {
    mockCaller.mockReturnValue(staff(['inventory', 'costs']))

    const props = await renderPage()

    expect(mockGetDailyInventoryReport).toHaveBeenCalled()
    expect(mockGetDailyRevenue).not.toHaveBeenCalled()
    expect(props.dailyRevenue).toBeUndefined()
    expect(props.isSalesWithheld).toBe(true)
  })

  it('reads everything for the owner, seeding units on the way', async () => {
    mockCaller.mockReturnValue({ ...staff([]), is_owner: true })

    const props = await renderPage()

    expect(mockSeedDefaultUnits).toHaveBeenCalledWith('t1')
    expect(mockGetDailyRevenue).toHaveBeenCalled()
    expect(props.dailyRevenue).toBe(1000)
    expect(props.isSalesWithheld).toBe(false)
    expect(props.access).toEqual({
      canEditMaster: true,
      canManageStock: true,
      canSeeCosts: true,
      canSeeSales: true,
    })
  })

  it('hands the screen the access it computed', async () => {
    mockCaller.mockReturnValue(staff(['inventory']))

    const props = await renderPage()

    expect(props.access).toEqual({
      canEditMaster: false,
      canManageStock: true,
      canSeeCosts: false,
      canSeeSales: false,
    })
  })
})
