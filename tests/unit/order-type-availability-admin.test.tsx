/**
 * Order type detail — Availability and POS pricing cards.
 *
 * Two switches decide where the type shows (web storefront, register); the DB
 * refuses a row hidden from both, so the form refuses first with a warning
 * instead of a constraint error. The markup input is optional: blank means
 * "store price" and must reach the server as null, not 0 or NaN. And every
 * save carries all three keys so an unrelated save cannot revert them.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const updateOrderTypeAction = jest.fn()
jest.mock('@/app/actions/order-types', () => ({
  updateOrderTypeAction: (...args: unknown[]) => updateOrderTypeAction(...args),
  deleteOrderTypeAction: jest.fn(),
  createCustomerFormFieldAction: jest.fn(),
  updateCustomerFormFieldAction: jest.fn(),
  deleteCustomerFormFieldAction: jest.fn(),
  reorderCustomerFormFieldsAction: jest.fn(),
}))

jest.mock('@/app/actions/order-type-pricing', () => ({
  setOrderTypeItemPriceAction: jest.fn(),
  clearOrderTypeItemPriceAction: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

const toastWarning = jest.fn()
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: (...a: unknown[]) => toastWarning(...a) },
}))

function makeOrderType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ot-1',
    tenant_id: 'tenant-1',
    type: 'grab',
    name: 'Grab',
    description: '',
    note: '',
    is_enabled: true,
    messenger_enabled: true,
    service_charge_enabled: false,
    service_charge_type: 'percentage',
    service_charge_value: 0,
    minimum_order_amount: 0,
    advance_order_enabled: false,
    advance_order_allow_asap: true,
    advance_order_lead_time_minutes: 30,
    advance_order_max_days_ahead: 7,
    advance_order_slot_interval_minutes: 30,
    order_index: 0,
    customer_form_fields: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

async function renderDetail(overrides: Record<string, unknown> = {}) {
  const { OrderTypeDetail } = await import('@/components/admin/order-type-detail')
  return render(
    <OrderTypeDetail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orderType={makeOrderType(overrides) as any}
      tenantId="tenant-1"
      tenantSlug="island-silog"
      menuItems={[]}
      initialPrices={[]}
    />
  )
}

function savePayload() {
  return updateOrderTypeAction.mock.calls[0][3]
}

beforeEach(() => {
  updateOrderTypeAction.mockReset()
  updateOrderTypeAction.mockResolvedValue({ success: true, data: makeOrderType() })
  toastWarning.mockClear()
})

describe('OrderTypeDetail — availability', () => {
  it('shows both channels on for rows saved before the columns existed', async () => {
    await renderDetail()
    expect(screen.getByLabelText(/available on web/i)).toBeChecked()
    expect(screen.getByLabelText(/available on pos/i)).toBeChecked()
  })

  it('reflects a saved web-off row', async () => {
    await renderDetail({ available_on_web: false, available_on_pos: true })
    expect(screen.getByLabelText(/available on web/i)).not.toBeChecked()
    expect(screen.getByLabelText(/available on pos/i)).toBeChecked()
  })

  it('refuses to turn off the last channel', async () => {
    const user = userEvent.setup()
    await renderDetail({ available_on_web: false, available_on_pos: true })

    await user.click(screen.getByLabelText(/available on pos/i))

    expect(screen.getByLabelText(/available on pos/i)).toBeChecked()
    expect(toastWarning).toHaveBeenCalledWith('Keep at least one channel on')
  })

  it('sends the toggled flags on save', async () => {
    const user = userEvent.setup()
    await renderDetail()

    await user.click(screen.getByLabelText(/available on web/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(savePayload()).toMatchObject({ available_on_web: false, available_on_pos: true })
  })
})

describe('OrderTypeDetail — POS markup', () => {
  it('shows the saved markup and previews ₱100 on the register', async () => {
    await renderDetail({ pos_markup_percent: 20 })

    expect(screen.getByLabelText(/pos markup/i)).toHaveValue(20)
    expect(screen.getByText(/₱100 becomes ₱120 on the register/i)).toBeInTheDocument()
  })

  it('sends null when the field is blank', async () => {
    const user = userEvent.setup()
    await renderDetail({ pos_markup_percent: 20 })

    await user.clear(screen.getByLabelText(/pos markup/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(savePayload()).toMatchObject({ pos_markup_percent: null })
  })

  it('sends the typed markup as a number', async () => {
    const user = userEvent.setup()
    await renderDetail()

    await user.type(screen.getByLabelText(/pos markup/i), '12.5')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(savePayload()).toMatchObject({ pos_markup_percent: 12.5 })
  })

  it('always carries the saved values so unrelated saves cannot revert them', async () => {
    const user = userEvent.setup()
    await renderDetail({ available_on_web: false, available_on_pos: true, pos_markup_percent: 25 })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(savePayload()).toMatchObject({
      available_on_web: false,
      available_on_pos: true,
      pos_markup_percent: 25,
    })
  })
})
