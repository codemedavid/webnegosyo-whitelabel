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

const mockTableRender = jest.fn()
jest.mock('@/components/admin/inventory-table', () => {
  const { InventoryTable } = jest.requireActual('@/components/admin/inventory-table')
  const { Profiler } = jest.requireActual('react')
  return {
    InventoryTable: (props: React.ComponentProps<typeof InventoryTable>) => (
      <Profiler id="inventory-table" onRender={mockTableRender}>
        <InventoryTable {...props} />
      </Profiler>
    ),
  }
})

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: ({ label }: { label?: string }) => <div data-testid="recipe-editor">{label}</div>,
}))
jest.mock('@/components/admin/stock-history-list', () => ({
  StockHistoryList: () => null,
}))

const deleteIngredientAction = jest.fn()
const previewIngredientDeleteAction = jest.fn()
const createIngredientAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createIngredientAction: (...a: unknown[]) => createIngredientAction(...a),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: (...a: unknown[]) => deleteIngredientAction(...a),
  previewIngredientDeleteAction: (...a: unknown[]) => previewIngredientDeleteAction(...a),
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
  it.each(['ingredient', 'stock'])('keeps the table idle while typing a %s draft', (form) => {
    renderManager()
    fireEvent.click(screen.getByRole('button', {
      name: form === 'ingredient' ? /add ingredient/i : /record stock for broccoli/i,
    }))
    mockTableRender.mockClear()

    fireEvent.change(screen.getByLabelText(form === 'ingredient' ? /^name$/i : /^quantity$/i), {
      target: { value: form === 'ingredient' ? 'Carrots' : '20' },
    })

    expect(mockTableRender).not.toHaveBeenCalled()
  })

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

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))

    expect(screen.getByRole('dialog')).toHaveTextContent(/new ingredient/i)
  })

  it('will not let a merchant add an ingredient before any unit exists', () => {
    render(
      <InventoryManager tenantId="t1" tenantSlug="demo" initialIngredients={[]} initialUnits={[]} />,
    )

    expect(screen.getByRole('button', { name: /add ingredient/i })).toBeDisabled()
  })

  it('opens the edit form prefilled from the row menu', () => {
    renderManager()

    // Editing an ingredient is a monthly job, so it sits in the menu behind
    // Record — the action the same row gets many times a day.
    fireEvent.click(screen.getByRole('button', { name: /more actions for broccoli/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /edit/i }))

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Broccoli')
  })

  it('records stock straight from the row, without opening a menu', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /record stock for broccoli/i }))

    expect(screen.getByRole('dialog')).toHaveTextContent(/stock — broccoli/i)
  })

  it('starts a fresh stock draft when navigation opens a different ingredient', () => {
    const props = {
      tenantId: 't1', tenantSlug: 'demo', initialUnits: [KG],
      initialIngredients: [BROCCOLI, item({ id: 'i2', name: 'Carrots' })],
    }
    const { rerender } = render(<InventoryManager {...props} stockItemId="i1" />)
    fireEvent.change(screen.getByLabelText(/^quantity$/i), { target: { value: '20' } })

    rerender(<InventoryManager {...props} stockItemId="i2" />)

    expect(screen.getByRole('dialog')).toHaveTextContent('Stock — Carrots')
    expect(screen.getByLabelText(/^quantity$/i)).toHaveValue(null)
  })

  it('opens the recipe editor for a prep item from the row menu', () => {
    renderManager([DOUGH])

    fireEvent.click(screen.getByRole('button', { name: /more actions for pizza dough/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /recipe/i }))

    expect(screen.getByTestId('recipe-editor')).toHaveTextContent(/pizza dough/i)
  })

  const DELETED = { outcome: 'deleted', recipeCount: 0, recipeLinesRemoved: 0 }
  const ARCHIVED = { outcome: 'archived', recipeCount: 2, recipeLinesRemoved: 2 }

  const clickDelete = (name: RegExp) => {
    fireEvent.click(screen.getByRole('button', { name }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
  }

  it('deletes the ingredient of the row the menu belongs to', async () => {
    previewIngredientDeleteAction.mockResolvedValue({ success: true, data: DELETED })
    deleteIngredientAction.mockResolvedValue({ success: true, data: DELETED })
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    clickDelete(/more actions for broccoli/i)

    await waitFor(() => expect(deleteIngredientAction).toHaveBeenCalledWith('i1', 't1', 'demo'))
  })

  it('drops a deleted ingredient out of the table', async () => {
    previewIngredientDeleteAction.mockResolvedValue({ success: true, data: DELETED })
    deleteIngredientAction.mockResolvedValue({ success: true, data: DELETED })
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    clickDelete(/more actions for broccoli/i)

    await waitFor(() => expect(screen.queryAllByTestId('inventory-row')).toHaveLength(0))
  })

  /*
    The bug: an ingredient used in a recipe could never be deleted, and one
    with stock history lost that history. The confirm now says what will
    really happen, read from the database before anything is written.
  */
  it('tells the merchant, before confirming, that recipes lose it and its history is kept', async () => {
    previewIngredientDeleteAction.mockResolvedValue({ success: true, data: { ...ARCHIVED, recipeLinesRemoved: 0 } })
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderManager()

    clickDelete(/more actions for broccoli/i)

    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][0]).toMatch(/2 recipes use it/)
    expect(confirm.mock.calls[0][0]).toMatch(/not in use/i)
    expect(deleteIngredientAction).not.toHaveBeenCalled()
  })

  it('keeps an archived ingredient in the table, marked Not in use', async () => {
    previewIngredientDeleteAction.mockResolvedValue({ success: true, data: ARCHIVED })
    deleteIngredientAction.mockResolvedValue({ success: true, data: ARCHIVED })
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    clickDelete(/more actions for broccoli/i)

    await waitFor(() => expect(screen.getByTestId('inventory-row')).toHaveTextContent(/not in use/i))
  })

  it('does not delete blind when the preview fails', async () => {
    previewIngredientDeleteAction.mockResolvedValue({ success: false, error: 'Failed to check ingredient' })
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    clickDelete(/more actions for broccoli/i)

    await waitFor(() => expect(previewIngredientDeleteAction).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
    expect(deleteIngredientAction).not.toHaveBeenCalled()
  })

  /*
    Units are configured once and then never again, so they moved off the tab
    bar and behind a button on the list they serve. Reachable, not resident.
  */
  it('reaches the units list from the ingredients toolbar', () => {
    renderManager()

    expect(screen.queryByRole('tab', { name: /units/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^units$/i }))

    expect(screen.getByRole('dialog')).toHaveTextContent(/units of measure/i)
  })

  it('opens on the ingredients tab, not on a dashboard', () => {
    renderManager()

    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /ingredients/i })).toHaveAttribute(
      'data-state',
      'active',
    )
  })
})
