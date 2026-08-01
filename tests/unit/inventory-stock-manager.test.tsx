/**
 * Phase 4A — recording stock from the inventory manager.
 *
 * Before this, a merchant could describe what an ingredient costs but never say
 * how much of it they had: `current_qty` rendered nowhere and no control wrote
 * it. These tests cover the door — showing the on-hand figure and recording a
 * movement against it.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'
import { InventoryManager } from '@/components/admin/inventory-manager'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/admin/recipe-editor', () => ({ RecipeEditor: () => null }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const recordStockMovementAction = jest.fn()
const getStockMovementsAction = jest.fn()
jest.mock('@/app/actions/inventory', () => ({
  getStockMovementsAction: (...a: unknown[]) => getStockMovementsAction(...a),
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

const MOVEMENTS = [
  {
    id: 'mv-2', tenant_id: 't1', inventory_item_id: FLOUR.id, reason: 'sale' as const,
    quantity_delta: -160, entered_quantity: 160, entered_unit_id: GRAM.id,
    balance_after: 800, note: null, order_id: 'ord-1', created_at: '2026-07-26T02:00:00.000Z',
  },
  {
    id: 'mv-1', tenant_id: 't1', inventory_item_id: FLOUR.id, reason: 'receive' as const,
    quantity_delta: 960, entered_quantity: 960, entered_unit_id: GRAM.id,
    balance_after: 960, note: 'Delivery #42', order_id: null,
    created_at: '2026-07-25T02:00:00.000Z',
  },
]

beforeEach(() => {
  recordStockMovementAction.mockReset()
  getStockMovementsAction.mockReset()
  getStockMovementsAction.mockResolvedValue({ success: true, data: MOVEMENTS })
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

/**
 * Recording is the row's primary action — a named button on the row itself, not
 * a second stop inside the overflow menu. Edit is what moved into the menu.
 */
function openStock(name = 'Flour') {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`record stock for ${name}`, 'i') }),
  )
}

describe('InventoryManager stock', () => {
  it('shows how much of an ingredient is on hand', () => {
    renderManager()

    expect(screen.getByText('800 g')).toBeInTheDocument()
  })

  it('records a delivery against the ingredient', async () => {
    // Arrange
    renderManager()
    openStock()

    // Act
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

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
    openStock()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    // The server's figure wins — a stale local total is exactly the bug the
    // ledger exists to prevent.
    expect(await screen.findByText('1300 g')).toBeInTheDocument()
  })

  /*
    A merchant on mobile data in a kitchen. The failure has to survive being
    looked away from: a toast dismisses itself while they are at the pass, and
    the failure they never read is the one that makes them record it twice.
  */
  it('keeps a failed movement on screen with what was typed still in it', async () => {
    recordStockMovementAction.mockResolvedValueOnce({
      success: false,
      error: 'Stock movement rejected',
    })
    renderManager()
    openStock()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/stock movement rejected/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(500)
  })

  it('says it cannot tell what happened when the server never answers', async () => {
    recordStockMovementAction.mockRejectedValueOnce(new Error('network down'))
    renderManager()
    openStock()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    // Never a claim it saved, and never a silent close.
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was saved/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears a stale failure when the dialog is opened again', async () => {
    recordStockMovementAction.mockResolvedValueOnce({ success: false, error: 'Nope' })
    renderManager()
    openStock()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    openStock()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /*
    The button carries the merchant's own choice. A bare "Record" left the
    movement off the one control they press, and a delivery ADDS stock and can
    blend a new cost into the average — the mistake a distracted tap makes is
    now a thing that can be read before it happens.
  */
  it('names the movement the button will write', () => {
    renderManager()
    openStock()

    expect(screen.getByRole('button', { name: /^record delivery$/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^wasted$/i }))
    expect(screen.getByRole('button', { name: /^record waste$/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^counted$/i }))
    expect(screen.getByRole('button', { name: /^record count$/i })).toBeInTheDocument()
  })

  it('says what the movement will do to the figure on hand', () => {
    renderManager()
    openStock()

    expect(screen.getByText(/added to the figure on hand/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^counted$/i }))
    expect(screen.getByText(/replaces the figure on hand/i)).toBeInTheDocument()
  })

  it('confirms the resulting figure, not merely that something happened', async () => {
    const { toast } = jest.requireMock('sonner')
    renderManager()
    openStock()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    // "Stock updated" confirmed an event; the merchant asked for an outcome.
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/1300 g on hand/i)),
    )
  })

  it('refuses to record a movement with no quantity', async () => {
    renderManager()
    openStock()

    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    await waitFor(() => expect(recordStockMovementAction).not.toHaveBeenCalled())
  })

  it('warns when an ingredient has fallen to its reorder level', () => {
    // 800g on hand against a reorder level of 1000g — this is the number a
    // merchant needs to see without opening anything.
    renderManager()

    expect(screen.getByLabelText(/low stock/i)).toBeInTheDocument()
  })

  it('does not warn when stock is comfortably above the reorder level', () => {
    renderManager({ ...FLOUR, current_qty: 5000 })

    expect(screen.queryByLabelText(/low stock/i)).not.toBeInTheDocument()
  })
})

/**
 * Phase 4D — the ledger has been recording since 4A and displaying nothing.
 * Without this, "why is this number wrong?" is answerable only in SQL.
 */
describe('InventoryManager stock history', () => {
  it('does not read the ledger until the merchant opens the ingredient', () => {
    // One request per ingredient on a 200-ingredient page would be absurd.
    renderManager()

    expect(getStockMovementsAction).not.toHaveBeenCalled()
  })

  it('lists what moved when the stock dialog opens', async () => {
    renderManager()

    openStock()

    expect(await screen.findByText(/Delivery #42/)).toBeInTheDocument()
    // Scoped to the history list: "Received" is also a reason button on the
    // form above it, so an unscoped query would match either one.
    const history = within(screen.getByRole('list'))
    expect(history.getByText('Sold')).toBeInTheDocument()
    expect(history.getByText('Received')).toBeInTheDocument()
    await waitFor(() =>
      expect(getStockMovementsAction).toHaveBeenCalledWith('t1', FLOUR.id),
    )
  })

  it('shows each movement signed, with the balance it left behind', async () => {
    renderManager()
    openStock()

    expect(await screen.findByText('-160 g')).toBeInTheDocument()
    expect(screen.getByText('+960 g')).toBeInTheDocument()
    expect(screen.getByText(/800 g left/i)).toBeInTheDocument()
  })

  it('says so plainly when an ingredient has no history yet', async () => {
    getStockMovementsAction.mockResolvedValue({ success: true, data: [] })
    renderManager()

    openStock()

    expect(await screen.findByText(/no movements recorded yet/i)).toBeInTheDocument()
  })

  it('keeps the recording form usable when the history fails to load', async () => {
    // History is a read. Losing it must not cost the merchant the ability to
    // write — that would turn a display problem into a data-entry outage.
    getStockMovementsAction.mockResolvedValue({ success: false, error: 'boom' })
    renderManager()

    openStock()

    expect(await screen.findByText(/couldn.t load the history/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^record delivery$/i })).toBeEnabled()
  })

  it('re-reads the ledger every time the dialog opens', async () => {
    // Recording closes the dialog, so the refresh that matters is the next
    // open. Caching the first read would show a merchant their own movement
    // missing from the history it just went into.
    renderManager()
    openStock()
    await screen.findByText('Sold')

    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /^record delivery$/i }))

    // Wait for the dialog to actually close rather than for the action to have
    // been called — the row button is inert behind the modal until it does.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    openStock()

    await waitFor(() => expect(getStockMovementsAction).toHaveBeenCalledTimes(2))
  })
})

/**
 * Phase 0 — the price is now converted from the unit the merchant picked into
 * the ingredient's stock unit, so the screen has to say which unit it is asking
 * about. "Unit cost" beside a unit dropdown is ambiguous exactly where the
 * 1000x error used to live, and the merchant cannot tell a right answer from a
 * wrong one without being told.
 */
describe('InventoryManager delivery price unit', () => {
  const KILOGRAM: InventoryUnitRow = {
    id: '33333333-3333-4333-8333-333333333333', tenant_id: 't1', name: 'Kilogram',
    abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000, is_base: false,
    is_active: true, created_at: '', updated_at: '',
  }

  function renderWithUnits() {
    render(
      <InventoryManager
        tenantId="t1"
        tenantSlug="demo"
        initialIngredients={[FLOUR]}
        initialUnits={[GRAM, KILOGRAM]}
      />,
    )
  }

  it('names the unit the price is per, defaulting to the stock unit', () => {
    // Arrange
    renderWithUnits()

    // Act
    openStock()

    // Assert — the field must state "per g", not a bare "Unit cost".
    expect(screen.getByLabelText(/cost per g/i)).toBeInTheDocument()
  })

})
