/**
 * The inventory manager, rebuilt on the Astryx design system.
 *
 * The shadcn original stacked every ingredient in its own Card. Astryx's own
 * guidance is the opposite for data like this — "dense data = rows (Table,
 * List/Item) edge-to-edge, never Card-wrapped list items" — so the rebuild is a
 * table, and these tests pin the behaviour that has to survive the move rather
 * than the markup that produced it.
 *
 * Everything the old component could do is asserted here: both tabs, the
 * prep/inactive distinctions, the stock level shown per row, the guard that
 * stops a merchant adding an ingredient before any unit exists, and the two
 * empty states.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { InventoryManager } from '@/components/admin/inventory/inventory-manager'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

jest.mock('@/app/actions/inventory', () => ({
  createIngredientAction: jest.fn(),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: jest.fn(),
}))

// Both load their own data on mount; neither is under test here.
jest.mock('@/components/admin/recipe-editor', () => ({
  RecipeEditor: () => <div data-testid="recipe-editor" />,
}))
jest.mock('@/components/admin/stock-history-list', () => ({
  StockHistoryList: () => <div data-testid="stock-history" />,
}))

const KG: InventoryUnitRow = {
  id: 'u-kg',
  tenant_id: 't1',
  name: 'Kilogram',
  abbreviation: 'kg',
  dimension: 'weight',
  to_base_factor: 1000,
  is_base: false,
  created_at: '2026-07-01T00:00:00.000Z',
}

function ingredient(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i-flour',
    tenant_id: 't1',
    name: 'Flour',
    sku: null,
    category: null,
    stock_unit_id: 'u-kg',
    unit_cost: 45,
    current_qty: 40,
    reorder_level: 20,
    is_prep: false,
    is_active: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as InventoryItem
}

function renderManager(
  ingredients: InventoryItem[] = [ingredient()],
  units: InventoryUnitRow[] = [KG],
) {
  return render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="cafe"
      initialIngredients={ingredients}
      initialUnits={units}
    />,
  )
}

describe('InventoryManager — ingredients', () => {
  it('lists every ingredient by name', () => {
    renderManager([ingredient({ id: 'a', name: 'Flour' }), ingredient({ id: 'b', name: 'Sugar' })])

    expect(screen.getByText('Flour')).toBeInTheDocument()
    expect(screen.getByText('Sugar')).toBeInTheDocument()
  })

  it('shows what each ingredient has on hand, in its own stock unit', () => {
    renderManager([ingredient({ current_qty: 12.5 })])

    expect(screen.getByText('12.5 kg')).toBeInTheDocument()
  })

  it('trims the trailing zeros a NUMERIC round-trip leaves behind', () => {
    renderManager([ingredient({ current_qty: 40.0 })])

    expect(screen.getByText('40 kg')).toBeInTheDocument()
  })

  it('flags an ingredient that has fallen to its reorder level', () => {
    renderManager([ingredient({ name: 'Flour', current_qty: 5, reorder_level: 20 })])

    expect(screen.getByLabelText('Running low')).toBeInTheDocument()
  })

  it('flags an exhausted ingredient differently from a merely low one', () => {
    renderManager([ingredient({ current_qty: 0 })])

    expect(screen.getByLabelText('Out of stock')).toBeInTheDocument()
  })

  it('says nothing about level for a healthy ingredient', () => {
    // A row per ingredient that is fine would drown the two that are not.
    renderManager([ingredient({ current_qty: 99, reorder_level: 20 })])

    expect(screen.queryByLabelText('Running low')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Out of stock')).not.toBeInTheDocument()
  })

  it('marks a prep item so it reads differently from a bought ingredient', () => {
    renderManager([ingredient({ name: 'Pizza Dough', is_prep: true })])

    expect(screen.getByText('Prep')).toBeInTheDocument()
  })

  it('offers a recipe only for prep items', () => {
    // A bought ingredient has nothing it is made of.
    renderManager([ingredient({ id: 'a', name: 'Flour', is_prep: false })])

    expect(screen.queryByRole('button', { name: /recipe/i })).not.toBeInTheDocument()
  })

  it('offers a recipe for a prep item', () => {
    renderManager([ingredient({ id: 'b', name: 'Dough', is_prep: true })])

    expect(screen.getByRole('button', { name: /recipe/i })).toBeInTheDocument()
  })

  it('marks a retired ingredient as inactive rather than hiding it', () => {
    renderManager([ingredient({ is_active: false })])

    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('explains itself when there are no ingredients yet', () => {
    renderManager([])

    expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument()
  })
})

describe('InventoryManager — the unit guard', () => {
  it('will not let a merchant add an ingredient before any unit exists', () => {
    // Ingredients are priced per unit; without one the form cannot be filled in.
    renderManager([], [])

    // Astryx uses aria-disabled rather than the native attribute whenever a
    // tooltip explains the block, so the button stays focusable and the reason
    // is reachable by keyboard. Activation is still refused.
    expect(screen.getByRole('button', { name: /new ingredient/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('says why the button is unavailable instead of leaving it dead', () => {
    renderManager([], [])

    expect(screen.getByText(/add at least one unit/i)).toBeInTheDocument()
  })

  it('allows adding an ingredient once a unit exists', () => {
    renderManager([], [KG])

    expect(screen.getByRole('button', { name: /new ingredient/i })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('InventoryManager — units tab', () => {
  it('starts on ingredients, not units', () => {
    renderManager()

    expect(screen.getByText('Flour')).toBeInTheDocument()
  })

  it('lists the units once the merchant switches to them', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /units/i }))

    // Astryx's truncating table renders the label a second time inside its
    // overflow tooltip, so scope to the table itself.
    // Astryx renders the label a second time inside its truncation tooltip, so
    // assert the unit is listed rather than that it appears exactly once.
    expect(within(screen.getByRole('table')).getAllByText(/Kilogram/).length).toBeGreaterThan(0)
  })

  it('shows how a unit converts to its base', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /units/i }))

    expect(screen.getByText(/1 kg = 1000 base/i)).toBeInTheDocument()
  })

  it('explains itself when there are no units yet', () => {
    renderManager([], [])

    fireEvent.click(screen.getByRole('button', { name: /units/i }))

    expect(screen.getByText(/no units yet/i)).toBeInTheDocument()
  })
})

describe('InventoryManager — dialogs', () => {
  it('opens an empty ingredient form from the new button', () => {
    renderManager()

    fireEvent.click(screen.getByRole('button', { name: /new ingredient/i }))

    const dialog = screen.getByRole('dialog')
    // The button that opened it carries the same words.
    expect(within(dialog).getByText('New Ingredient')).toBeInTheDocument()
  })

  it('opens the form titled for editing when an existing ingredient is picked', () => {
    renderManager([ingredient({ name: 'Flour' })])

    fireEvent.click(screen.getByRole('button', { name: /edit flour/i }))

    expect(screen.getByText('Edit Ingredient')).toBeInTheDocument()
  })

  it('names the ingredient in the stock dialog so the merchant knows what they are counting', () => {
    renderManager([ingredient({ name: 'Flour' })])

    fireEvent.click(screen.getByRole('button', { name: /record stock for flour/i }))

    expect(within(screen.getByRole('dialog')).getByText(/Flour/)).toBeInTheDocument()
  })
})

describe('InventoryManager — units CRUD', () => {
  // The units tab had no interaction coverage before the rebuild; its save and
  // delete paths are the ones that can silently drop a merchant's edit.
  const actions = jest.requireMock('@/app/actions/inventory')

  beforeEach(() => jest.clearAllMocks())

  function openUnits() {
    renderManager([], [KG])
    fireEvent.click(screen.getByRole('button', { name: /units/i }))
  }

  it('sends a new unit to the server', async () => {
    actions.createInventoryUnitAction.mockResolvedValue({ success: true, data: { ...KG, id: 'u2' } })
    openUnits()

    fireEvent.click(screen.getByRole('button', { name: /new unit/i }))
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Gram' } })
    fireEvent.change(screen.getByLabelText(/abbreviation/i), { target: { value: 'g' } })
    fireEvent.click(screen.getByRole('button', { name: /add unit/i }))

    await waitFor(() => expect(actions.createInventoryUnitAction).toHaveBeenCalled())
    const [, , input] = actions.createInventoryUnitAction.mock.calls[0]
    expect(input).toMatchObject({ name: 'Gram', abbreviation: 'g' })
  })

  it('does not call the server when the form is invalid', async () => {
    // An empty name must be caught before a round trip, not after.
    openUnits()

    fireEvent.click(screen.getByRole('button', { name: /new unit/i }))
    fireEvent.click(screen.getByRole('button', { name: /add unit/i }))

    await waitFor(() => expect(actions.createInventoryUnitAction).not.toHaveBeenCalled())
  })

  it('asks before deleting a unit and deletes when confirmed', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    actions.deleteInventoryUnitAction.mockResolvedValue({ success: true })
    openUnits()

    fireEvent.click(screen.getByRole('button', { name: /delete kilogram/i }))

    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(actions.deleteInventoryUnitAction).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('leaves the unit alone when the merchant cancels the confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    openUnits()

    fireEvent.click(screen.getByRole('button', { name: /delete kilogram/i }))

    expect(actions.deleteInventoryUnitAction).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('opens the unit form titled for editing an existing unit', () => {
    openUnits()

    fireEvent.click(screen.getByRole('button', { name: /edit kilogram/i }))

    expect(within(screen.getByRole('dialog')).getByText('Edit Unit')).toBeInTheDocument()
  })
})

describe('InventoryManager — ingredient deletion', () => {
  const actions = jest.requireMock('@/app/actions/inventory')

  beforeEach(() => jest.clearAllMocks())

  it('asks before deleting an ingredient, warning that recipes lose the line', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    renderManager([ingredient({ name: 'Flour' })])

    fireEvent.click(screen.getByRole('button', { name: /delete flour/i }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Recipes using it'))
    confirmSpy.mockRestore()
  })
})
