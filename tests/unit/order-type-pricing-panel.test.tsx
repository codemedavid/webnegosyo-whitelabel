/**
 * `OrderTypePricingPanel` — per-item exact prices for one order type.
 *
 * The computed column uses the same pure resolver the register does, so what
 * the merchant sees here is what the cashier charges. An override shows as
 * "Custom"; clearing it returns the item to the markup path.
 */

import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setAction = jest.fn()
const clearAction = jest.fn()
jest.mock('@/app/actions/order-type-pricing', () => ({
  setOrderTypeItemPriceAction: (...a: unknown[]) => setAction(...a),
  clearOrderTypeItemPriceAction: (...a: unknown[]) => clearAction(...a),
}))

const toastSuccess = jest.fn()
const toastError = jest.fn()
jest.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: jest.fn(),
  },
}))

const MENU = [
  { id: 'silog', name: 'Tapsilog', price: 100, discounted_price: null, category_name: 'Rice' },
  { id: 'coffee', name: 'Kape', price: 80, discounted_price: 60, category_name: 'Drinks' },
]

function priceRow(id: string, price: number) {
  return {
    id: `row-${id}`,
    tenant_id: 'tenant-1',
    order_type_id: 'ot-grab',
    menu_item_id: id,
    price,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

async function renderPanel(props: { markupPercent?: number | null; initialPrices?: ReturnType<typeof priceRow>[] } = {}) {
  const { OrderTypePricingPanel } = await import('@/components/admin/order-type-pricing-panel')
  return render(
    <OrderTypePricingPanel
      tenantId="tenant-1"
      tenantSlug="island-silog"
      orderTypeId="ot-grab"
      markupPercent={props.markupPercent ?? null}
      menuItems={MENU}
      initialPrices={props.initialPrices ?? []}
    />
  )
}

function rowFor(name: string) {
  return screen.getByRole('row', { name: new RegExp(name, 'i') })
}

beforeEach(() => {
  setAction.mockReset()
  clearAction.mockReset()
  toastSuccess.mockClear()
  toastError.mockClear()
})

describe('OrderTypePricingPanel', () => {
  it('shows the store price and the marked-up register price per item', async () => {
    await renderPanel({ markupPercent: 20 })

    const silog = rowFor('Tapsilog')
    expect(within(silog).getByText('₱100.00')).toBeInTheDocument()
    expect(within(silog).getByText('₱120.00')).toBeInTheDocument()

    // The discounted price is the effective store price the register starts from.
    const kape = rowFor('Kape')
    expect(within(kape).getByText('₱60.00')).toBeInTheDocument()
    expect(within(kape).getByText('₱72.00')).toBeInTheDocument()
  })

  it('shows the store price unchanged when there is no markup', async () => {
    await renderPanel()

    const silog = rowFor('Tapsilog')
    expect(within(silog).getAllByText('₱100.00')).toHaveLength(2)
  })

  it('marks an overridden item as Custom and uses the override', async () => {
    await renderPanel({ markupPercent: 20, initialPrices: [priceRow('silog', 150)] })

    const silog = rowFor('Tapsilog')
    expect(within(silog).getByText(/custom/i)).toBeInTheDocument()
    expect(within(silog).getByText('₱150.00')).toBeInTheDocument()
    expect(within(rowFor('Kape')).queryByText(/custom/i)).not.toBeInTheDocument()
  })

  it('filters rows by search', async () => {
    const user = userEvent.setup()
    await renderPanel()

    await user.type(screen.getByPlaceholderText(/search/i), 'kape')

    expect(screen.queryByRole('row', { name: /tapsilog/i })).not.toBeInTheDocument()
    expect(rowFor('Kape')).toBeInTheDocument()
  })

  it('sets an override through the action and shows it', async () => {
    const user = userEvent.setup()
    setAction.mockResolvedValue({ success: true, data: priceRow('silog', 150) })
    await renderPanel({ markupPercent: 20 })

    const silog = rowFor('Tapsilog')
    await user.type(within(silog).getByRole('spinbutton'), '150')
    await user.click(within(silog).getByRole('button', { name: /set/i }))

    await waitFor(() => expect(setAction).toHaveBeenCalled())
    expect(setAction.mock.calls[0]).toEqual([
      'tenant-1',
      'island-silog',
      'ot-grab',
      { menu_item_id: 'silog', price: 150 },
    ])
    await waitFor(() => expect(within(rowFor('Tapsilog')).getByText(/custom/i)).toBeInTheDocument())
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('refuses to set a blank or negative override without calling the action', async () => {
    const user = userEvent.setup()
    await renderPanel()

    const silog = rowFor('Tapsilog')
    await user.click(within(silog).getByRole('button', { name: /set/i }))

    expect(setAction).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it('clears an override through the action', async () => {
    const user = userEvent.setup()
    clearAction.mockResolvedValue({ success: true })
    await renderPanel({ markupPercent: 20, initialPrices: [priceRow('silog', 150)] })

    await user.click(within(rowFor('Tapsilog')).getByRole('button', { name: /clear/i }))

    await waitFor(() => expect(clearAction).toHaveBeenCalledWith('tenant-1', 'island-silog', 'ot-grab', 'silog'))
    await waitFor(() =>
      expect(within(rowFor('Tapsilog')).queryByText(/custom/i)).not.toBeInTheDocument()
    )
    expect(within(rowFor('Tapsilog')).getByText('₱120.00')).toBeInTheDocument()
  })

  it('surfaces a failed set as an error toast and keeps the row unchanged', async () => {
    const user = userEvent.setup()
    setAction.mockResolvedValue({ success: false, error: 'Unauthorized' })
    await renderPanel()

    const silog = rowFor('Tapsilog')
    await user.type(within(silog).getByRole('spinbutton'), '150')
    await user.click(within(silog).getByRole('button', { name: /set/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Unauthorized'))
    expect(within(rowFor('Tapsilog')).queryByText(/custom/i)).not.toBeInTheDocument()
  })

  it('shows an empty state when the menu has no items', async () => {
    const { OrderTypePricingPanel } = await import('@/components/admin/order-type-pricing-panel')
    render(
      <OrderTypePricingPanel
        tenantId="tenant-1"
        tenantSlug="island-silog"
        orderTypeId="ot-grab"
        markupPercent={null}
        menuItems={[]}
        initialPrices={[]}
      />
    )
    expect(screen.getByText(/no menu items/i)).toBeInTheDocument()
  })
})
