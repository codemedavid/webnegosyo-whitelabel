/**
 * The count session, reachable from the ingredients screen.
 *
 * Everything beneath this has been correct and invisible. The schema, the
 * judgement, the service, the actions and the panel all exist, and until they
 * are mounted `inventory_count_id` is still written by nobody.
 *
 * The load-bearing assertion here is the second one: a stocktake recorded while
 * a count is running must be FILED under it without the merchant doing
 * anything. If joining were a thing to remember, the entries a busy kitchen
 * forgot to tag would leave the count reading as partial — and a coverage
 * figure that under-reports honest work is how merchants learn to ignore it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const recordStockMovementAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: jest.fn(() => Promise.resolve({ success: true, data: [] })),
  createIngredientAction: jest.fn(),
  updateIngredientAction: jest.fn(),
  deleteIngredientAction: jest.fn(),
  createInventoryUnitAction: jest.fn(),
  updateInventoryUnitAction: jest.fn(),
  deleteInventoryUnitAction: jest.fn(),
  recordStockMovementAction: (...a: unknown[]) => recordStockMovementAction(...a),
}))
jest.mock('@/app/actions/inventory-counts', () => ({
  openStockCountAction: jest.fn(() => Promise.resolve({ success: true, data: { id: 'count-1' } })),
  closeStockCountAction: jest.fn(() => Promise.resolve({ success: true })),
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

const COUNT_ID = '33333333-3333-4333-8333-333333333333'

const RUNNING = {
  state: 'open' as const,
  countedCount: 12,
  expectedCount: 40,
  coveragePercent: 30,
  isShelfAccountedFor: false,
}

beforeEach(() => {
  recordStockMovementAction.mockReset().mockResolvedValue({
    success: true,
    data: { item: { ...FLOUR, current_qty: 900 } },
  })
})

function renderManager(props: Record<string, unknown> = {}) {
  render(
    <InventoryManager
      tenantId="t1"
      tenantSlug="demo"
      initialIngredients={[FLOUR]}
      initialUnits={[GRAM]}
      {...props}
    />,
  )
}

/** Record a count of 900 g against Flour. */
async function recordStocktake() {
  fireEvent.click(screen.getByRole('button', { name: /record stock for Flour/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^counted$/i }))
  fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '900' } })
  fireEvent.click(screen.getByRole('button', { name: /^record count$/i }))
}

describe('the count panel on the ingredients screen', () => {
  it('offers a count when none is running', () => {
    renderManager()

    expect(screen.getByRole('button', { name: /start stock count/i })).toBeInTheDocument()
  })

  it('shows the running count instead', () => {
    renderManager({ openCountId: COUNT_ID, countProgress: RUNNING })

    expect(screen.getByTestId('stock-count-progress')).toHaveTextContent(/12 of 40/)
  })
})

describe('recording while a count is running', () => {
  it('files the stocktake under the count, with nothing asked of the merchant', async () => {
    renderManager({ openCountId: COUNT_ID, countProgress: RUNNING })

    await recordStocktake()

    await waitFor(() => expect(recordStockMovementAction).toHaveBeenCalled())
    expect(recordStockMovementAction.mock.calls[0][2]).toMatchObject({
      reason: 'stocktake',
      inventory_count_id: COUNT_ID,
    })
  })

  it('records a one-off when no count is running', async () => {
    // The behaviour every tenant has today, and it must not change.
    renderManager()

    await recordStocktake()

    await waitFor(() => expect(recordStockMovementAction).toHaveBeenCalled())
    expect(recordStockMovementAction.mock.calls[0][2].inventory_count_id).toBeUndefined()
  })
})
