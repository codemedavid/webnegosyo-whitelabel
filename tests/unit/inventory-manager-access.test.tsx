/**
 * Phase 0d — the Inventory screen follows the account's keys (plan §6).
 *
 * An inventory clerk records deliveries, waste and counts, but does not add,
 * rename or archive ingredients (`menu`), does not see what anything costs
 * (`costs`), and so never sees the priced daily report. Every control they
 * cannot use is ABSENT rather than refused after a tap, and every peso figure
 * they may not see is absent rather than ₱0.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import type { DailyInventoryReportForDay } from '@/lib/inventory/daily-report-read'
import type { InventoryAccess } from '@/components/admin/inventory-manager/inventory-access'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('@/components/admin/stock-history-list', () => ({ StockHistoryList: () => null }))

const mockUpdateIngredient = jest.fn()
const mockCreateIngredient = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createIngredientAction: (...a: unknown[]) => mockCreateIngredient(...a),
  updateIngredientAction: (...a: unknown[]) => mockUpdateIngredient(...a),
  deleteIngredientAction: jest.fn(),
  previewIngredientDeleteAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: jest.fn(),
  setBranchReorderLevelAction: jest.fn(),
}))

// next/jest leaves static imports ahead of jest.mock, so import lazily.
function loadManager() {
  return (jest.requireActual('@/components/admin/inventory-manager') as typeof import('@/components/admin/inventory-manager')).InventoryManager
}

const KG: InventoryUnitRow = {
  id: '22222222-2222-4222-8222-222222222222', tenant_id: 't1', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight',
  to_base_factor: 1000, is_base: false, is_active: true, created_at: '', updated_at: '',
}

const BROCCOLI: InventoryItem = {
  id: 'i1', tenant_id: 't1', name: 'Broccoli', sku: 'V01456', category: 'Vegetable',
  stock_unit_id: KG.id, unit_cost: 12.5, is_prep: true, image_url: null, current_qty: 10,
  reorder_level: 2, is_active: true, created_at: '', updated_at: '',
}

const REPORT: DailyInventoryReportForDay = {
  dayKey: '2026-07-29',
  rows: [],
  totals: { cogs: 300, wasteCost: 0, shrinkageCost: 0 },
  countedCount: 0,
  uncountedCount: 0,
  uncostedCount: 0,
  countSession: null,
}

const OWNER: InventoryAccess = { canEditMaster: true, canManageStock: true, canSeeCosts: true, canSeeSales: true }
const CLERK: InventoryAccess = { canEditMaster: false, canManageStock: true, canSeeCosts: false, canSeeSales: false }
const KITCHEN_LEAD: InventoryAccess = { canEditMaster: true, canManageStock: true, canSeeCosts: false, canSeeSales: false }

function renderManager(access: InventoryAccess) {
  const InventoryManager = loadManager()
  return render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="demo"
      initialIngredients={[BROCCOLI]}
      initialUnits={[KG]}
      dailyReport={REPORT}
      latestDayKey="2026-07-30"
      access={access}
    />,
  )
}

function openRowMenu() {
  fireEvent.click(screen.getByRole('button', { name: /more actions for broccoli/i }))
}

beforeEach(() => jest.clearAllMocks())

describe('InventoryManager — tabs follow the account', () => {
  it('gives the owner every tab', () => {
    renderManager(OWNER)

    expect(screen.getByRole('tab', { name: 'Recipes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reports' })).toBeInTheDocument()
  })

  it('hides Recipes without menu and the priced report without costs', () => {
    renderManager(CLERK)

    expect(screen.getByRole('tab', { name: 'Ingredients' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Recipes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument()
  })
})

describe('InventoryManager — an inventory clerk', () => {
  it('records stock but cannot add, import, export or manage units', () => {
    renderManager(CLERK)

    expect(screen.getByRole('button', { name: /record stock for broccoli/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add ingredient/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^units$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })

  it('has no edit, recipe or delete door on a row', () => {
    renderManager(CLERK)

    expect(screen.queryByRole('button', { name: /more actions for broccoli/i })).not.toBeInTheDocument()
  })

  it('records a delivery without a price and is never shown the current cost', () => {
    // A delivery price is blended into the ingredient's cost, so typing one is
    // a cost change: it needs costs (Phase 0d security review H1).
    renderManager(CLERK)
    fireEvent.click(screen.getByRole('button', { name: /record stock for broccoli/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('spinbutton', { name: /cost per kg/i })).not.toBeInTheDocument()
    expect(dialog.innerHTML).not.toContain('12.50')
  })
})

describe('InventoryManager — a menu editor without costs', () => {
  it('manages the ingredient list', () => {
    renderManager(KITCHEN_LEAD)
    openRowMenu()

    expect(screen.getByRole('button', { name: /add ingredient/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /recipe/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
  })

  it('cannot export or import, because both files carry unit costs', () => {
    renderManager(KITCHEN_LEAD)

    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument()
  })

  it('edits an ingredient without seeing, or changing, its unit cost', async () => {
    mockUpdateIngredient.mockResolvedValue({ success: true, data: { ...BROCCOLI, name: 'Brocoli' } })
    renderManager(KITCHEN_LEAD)
    openRowMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }))

    expect(screen.queryByLabelText(/unit cost/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Brocoli' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockUpdateIngredient).toHaveBeenCalled())
    const [, , , input] = mockUpdateIngredient.mock.calls[0]
    // The price is left OUT (the server keeps the stored one), never resent:
    // a resent price goes stale the moment a delivery re-blends it.
    expect(input).toMatchObject({ name: 'Brocoli' })
    expect(input).not.toHaveProperty('unit_cost')
  })

  it('adds an ingredient at no cost, which needs no costs grant', async () => {
    mockCreateIngredient.mockResolvedValue({ success: true, data: { ...BROCCOLI, id: 'i2', name: 'Kale' } })
    renderManager(KITCHEN_LEAD)
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))

    expect(screen.queryByLabelText(/unit cost/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Kale' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add ingredient$/i }))

    await waitFor(() => expect(mockCreateIngredient).toHaveBeenCalled())
    const [, , input] = mockCreateIngredient.mock.calls[0]
    expect(input.unit_cost).toBe(0)
  })
})

describe('InventoryManager — the owner', () => {
  it('sees and edits the unit cost', () => {
    renderManager(OWNER)
    openRowMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }))

    expect(screen.getByLabelText(/unit cost/i)).toHaveValue(12.5)
  })

  it('is shown the current cost as the delivery price hint', () => {
    renderManager(OWNER)
    fireEvent.click(screen.getByRole('button', { name: /record stock for broccoli/i }))

    expect(screen.getByPlaceholderText('12.50')).toBeInTheDocument()
  })
})
