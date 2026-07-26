/**
 * Phase 4A — recording stock from the inventory manager.
 *
 * Before this, a merchant could describe what an ingredient costs but never say
 * how much of it they had: `current_qty` rendered nowhere and no control wrote
 * it. These tests cover the door — showing the on-hand figure and recording a
 * movement against it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const recordStockMovementAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  createIngredientAction: jest.fn(),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: (...a: unknown[]) => recordStockMovementAction(...a),
}))

const GRAM: InventoryUnitRow = {
  id: '22222222-2222-4222-8222-222222222222', tenant_id: 't1', name: 'Gram',
  abbreviation: 'g', dimension: 'weight', to_base_factor: 1, is_base: true,
  is_active: true, created_at: '', updated_at: '',
}

const FLOUR: InventoryItem = {
  id: '11111111-1111-4111-8111-111111111111', tenant_id: 't1', name: 'Flour',
  sku: null, category: null, stock_unit_id: GRAM.id, unit_cost: 0.05, is_prep: false,
  image_url: null, current_qty: 800, reorder_level: 1000, is_active: true,
  created_at: '', updated_at: '',
}

beforeEach(() => {
  recordStockMovementAction.mockReset()
  recordStockMovementAction.mockResolvedValue({
    success: true,
    data: { item: { ...FLOUR, current_qty: 1300 } },
  })
})

function renderManager(item: InventoryItem = FLOUR) {
  render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="demo"
      initialIngredients={[item]}
      initialUnits={[GRAM]}
    />,
  )
}

describe('InventoryManager stock', () => {
  it('shows how much of an ingredient is on hand', () => {
    renderManager()

    expect(screen.getByText(/800 g on hand/i)).toBeInTheDocument()
  })

  it('records a delivery against the ingredient', async () => {
    // Arrange
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: /stock/i }))

    // Act
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }))

    // Assert — the form sends a magnitude; the server signs it and applies it
    // to the quantity it reads itself, never the one this page happens to hold.
    await waitFor(() => expect(recordStockMovementAction).toHaveBeenCalled())
    const [, , input] = recordStockMovementAction.mock.calls[0]
    expect(input).toMatchObject({
      inventory_item_id: FLOUR.id,
      reason: 'receive',
      quantity: 500,
    })
  })

  it('shows the new on-hand figure the server reports back', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: /stock/i }))
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record$/i }))

    // The server's figure wins — a stale local total is exactly the bug the
    // ledger exists to prevent.
    expect(await screen.findByText(/1300 g on hand/i)).toBeInTheDocument()
  })

  it('refuses to record a movement with no quantity', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: /stock/i }))

    fireEvent.click(screen.getByRole('button', { name: /^record$/i }))

    await waitFor(() => expect(recordStockMovementAction).not.toHaveBeenCalled())
  })

  it('warns when an ingredient has fallen to its reorder level', () => {
    // 800g on hand against a reorder level of 1000g — this is the number a
    // merchant needs to see without opening anything.
    renderManager()

    expect(screen.getByText(/low stock/i)).toBeInTheDocument()
  })

  it('does not warn when stock is comfortably above the reorder level', () => {
    renderManager({ ...FLOUR, current_qty: 5000 })

    expect(screen.queryByText(/low stock/i)).not.toBeInTheDocument()
  })
})
