/**
 * "Pay after billing" — admin surface.
 *
 * The merchant turns the flag on per order type, beside the other checkout
 * behavior switches. Two things have to hold: the form must show the saved
 * value, and saving must send what the merchant toggled (a payload that omits
 * the key would silently revert the setting on every unrelated save).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTypeDetail } from '@/components/admin/order-type-detail'

const updateOrderTypeAction = jest.fn()

jest.mock('@/app/actions/order-types', () => ({
  updateOrderTypeAction: (...args: unknown[]) => updateOrderTypeAction(...args),
  deleteOrderTypeAction: jest.fn(),
  createCustomerFormFieldAction: jest.fn(),
  updateCustomerFormFieldAction: jest.fn(),
  deleteCustomerFormFieldAction: jest.fn(),
  reorderCustomerFormFieldsAction: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

function makeOrderType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ot-1',
    tenant_id: 'tenant-1',
    type: 'dine_in',
    name: 'Dine In',
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

function renderDetail(overrides: Record<string, unknown> = {}) {
  return render(
    <OrderTypeDetail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orderType={makeOrderType(overrides) as any}
      tenantId="tenant-1"
      tenantSlug="island-silog"
    />
  )
}

describe('OrderTypeDetail — pay after billing', () => {
  beforeEach(() => {
    updateOrderTypeAction.mockReset()
    updateOrderTypeAction.mockResolvedValue({ success: true, data: makeOrderType() })
  })

  it('shows the switch off for order types saved before the column existed', () => {
    renderDetail() // no after_billing_payment_enabled key at all
    expect(screen.getByLabelText(/pay after billing/i)).not.toBeChecked()
  })

  it('shows the switch on when the merchant already enabled it', () => {
    renderDetail({ after_billing_payment_enabled: true })
    expect(screen.getByLabelText(/pay after billing/i)).toBeChecked()
  })

  it('sends the toggled value when the merchant saves', async () => {
    const user = userEvent.setup()
    renderDetail()

    await user.click(screen.getByLabelText(/pay after billing/i))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateOrderTypeAction).toHaveBeenCalled()
    const settings = updateOrderTypeAction.mock.calls[0][3]
    expect(settings).toMatchObject({ after_billing_payment_enabled: true })
  })

  it('always carries the current value in the save payload, so unrelated saves cannot revert it', async () => {
    const user = userEvent.setup()
    renderDetail({ after_billing_payment_enabled: true })

    await user.click(screen.getByRole('button', { name: /save/i }))

    const settings = updateOrderTypeAction.mock.calls[0][3]
    expect(settings).toMatchObject({ after_billing_payment_enabled: true })
  })
})
