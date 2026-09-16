/**
 * Two sources of truth on one screen.
 *
 * After adding the first ingredient the table said "1 ingredient" while the
 * strip above it still said "No ingredients yet": the table read the client
 * list the save had just appended to, the strip read a server figure frozen at
 * page load. The strip now derives its counts from the same list as the table,
 * so the two can never disagree about how many rows exist.
 */

import { render, screen } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'
import type { InventoryHealth } from '@/lib/inventory/inventory-health'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn().mockResolvedValue({ success: true, data: [] }),
  createIngredientAction: jest.fn(),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: jest.fn(),
}))

const GRAM: InventoryUnitRow = {
  id: '22222222-2222-4222-8222-222222222222', tenant_id: 't1', name: 'Gram',
  abbreviation: 'g', dimension: 'weight', to_base_factor: 1, is_base: true,
  is_active: true, created_at: '', updated_at: '',
}

const QA_STOCK: InventoryItem = {
  id: '11111111-1111-4111-8111-111111111111', tenant_id: 't1', name: 'QA Sample Stock',
  sku: null, category: null, stock_unit_id: GRAM.id, unit_cost: 10, is_prep: false,
  image_url: null, current_qty: 0, reorder_level: 5, is_active: true,
  created_at: '', updated_at: '',
}

/** What the server computed before the ingredient existed. */
const STALE_EMPTY_HEALTH: InventoryHealth = {
  ingredients: { total: 0, ok: 0, low: 0, out: 0 },
  dishes: { total: 8, withRecipe: 0, autoHidden: 0 },
  gaps: [{ id: 'no-ingredients', title: 'No ingredients yet', detail: '', isSelfServe: true }],
}

const FLAGS = { lowStockAlertsEnabled: true, auto86Enabled: false }

describe('InventoryManager health strip', () => {
  it('counts the rows the table shows, not a figure frozen at page load', () => {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="seacook"
        initialIngredients={[QA_STOCK]}
        initialUnits={[GRAM]}
        health={STALE_EMPTY_HEALTH}
        healthFlags={FLAGS}
      />,
    )

    expect(screen.queryByText(/no ingredients yet/i)).not.toBeInTheDocument()
    expect(screen.getByText('1 ingredient')).toBeInTheDocument()
    expect(screen.getByText('out of stock')).toBeInTheDocument()
  })

  it('still leads with the instruction when the list really is empty', () => {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="seacook"
        initialIngredients={[]}
        initialUnits={[GRAM]}
        health={STALE_EMPTY_HEALTH}
        healthFlags={FLAGS}
      />,
    )

    expect(screen.getByText(/add the raw materials you buy/i)).toBeInTheDocument()
  })
})
