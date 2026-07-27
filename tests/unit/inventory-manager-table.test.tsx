/**
 * The inventory manager, rebuilt on the table.
 *
 * The card list is gone; every door it offered — add, edit, stock, recipe,
 * delete — has to still open from the table, and the last-purchase column has
 * to reflect what the server actually read from the ledger.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ label }: { label?: string }) => <div data-testid="recipe-editor">{label}</div>,
}))
jest.mock('@/components/admin/stock-history-list', () => ({
  StockHistoryList: () => null,
}))

const deleteIngredientAction = jest.fn()
const createIngredientAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createIngredientAction: (...a: unknown[]) => createIngredientAction(...a),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: (...a: unknown[]) => deleteIngredientAction(...a),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: jest.fn(),
}))

const KG: InventoryUnitRow = {
  id: 'u-kg', tenant_id: 't1', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight',
  to_base_factor: 1000, is_base: false, is_active: true, created_at: '', updated_at: '',
}

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1', tenant_id: 't1', name: 'Broccoli', sku: 'V01456', category: 'Vegetable',
  stock_unit_id: KG.id, unit_cost: 12, is_prep: false, image_url: null, current_qty: 10,
  reorder_level: 0, is_active: true, created_at: '', updated_at: '',
  ...over,
})

const BROCCOLI = item({})
const DOUGH = item({ id: 'p1', name: 'Pizza Dough', sku: null, category: null, is_prep: true })

function renderManager(
  ingredients: InventoryItem[] = [BROCCOLI],
  props: Partial<React.ComponentProps<typeof InventoryManager>> = {},
) {
  render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="demo"
      initialIngredients={ingredients}
      initialUnits={[KG]}
      {...props}
    />,
  )
}

beforeEach(() => jest.clearAllMocks())

describe('InventoryManager table', () => {
  it('renders ingredients as table rows rather than cards', () => {
    renderManager()

    const row = screen.getByTestId('inventory-row')
    expect(within(row).getByText('V01456')).toBeInTheDocument()
    expect(within(row).getByText('Broccoli')).toBeInTheDocument()
    expect(within(row).getByText('10 kg')).toBeInTheDocument()
  })

  it('shows the last purchase the server read from the ledger', () => {
    renderManager([BROCCOLI], { lastPurchaseByItemId: { i1: '2026-05-03T00:00:00.000Z' } })

    expect(
      screen.getByText((text) => text.includes('May') && text.includes('2026')),
    ).toBeInTheDocument()
  })

  it('says "Never" for an ingredient that was never received', () => {
    renderManager()

    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('opens the create form from the table toolbar', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /add item/i }))

    expect(screen.getByRole('dialog')).toHaveTextContent(/new ingredient/i)
  })

  it('will not let a merchant add an ingredient before any unit exists', () => {
    render(
      <InventoryManager tenantId="t1" tenantSlug="demo" initialIngredients={[]} initialUnits={[]} />,
    )

    expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
  })

  it('opens the edit form prefilled from the row', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /edit broccoli/i }))

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Broccoli')
  })

  it('opens the recipe editor for a prep item from the row menu', () => {
    renderManager([DOUGH])

    fireEvent.click(screen.getByRole('button', { name: /more actions for pizza dough/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /recipe/i }))

    expect(screen.getByTestId('recipe-editor')).toHaveTextContent(/pizza dough/i)
  })

  it('deletes the ingredient of the row the menu belongs to', async () => {
    deleteIngredientAction.mockResolvedValue({ success: true })
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /more actions for broccoli/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))

    await waitFor(() => expect(deleteIngredientAction).toHaveBeenCalledWith('i1', 't1', 'demo'))
  })

  it('drops a deleted ingredient out of the table', async () => {
    deleteIngredientAction.mockResolvedValue({ success: true })
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /more actions for broccoli/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))

    await waitFor(() => expect(screen.queryAllByTestId('inventory-row')).toHaveLength(0))
  })

  it('keeps the units tab reachable', () => {
    renderManager()

    expect(screen.getByRole('tab', { name: /units/i })).toBeInTheDocument()
  })
})
