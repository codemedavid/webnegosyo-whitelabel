/**
 * Per-order-type minimum order — admin surface.
 *
 * A merchant sets the minimum on the order type itself ("Delivery ₱500"), beside
 * the service charge it most resembles. Two things have to hold for that setting
 * to survive: the write schema must carry the field through (a zod object strips
 * unknown keys, so a missing key silently discards the merchant's input), and the
 * form must send what the merchant typed.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { orderTypeSchema } from '@/lib/order-types-service'
import { OrderTypeDetail } from '@/components/admin/order-type-detail'

// ---- Write schema ---------------------------------------------------------

const baseInput = {
  type: 'delivery' as const,
  name: 'Delivery',
  is_enabled: true,
  order_index: 0,
}

describe('orderTypeSchema — minimum_order_amount', () => {
  it('carries the minimum through to the database payload', () => {
    const parsed = orderTypeSchema.parse({ ...baseInput, minimum_order_amount: 500 })
    expect(parsed).toMatchObject({ minimum_order_amount: 500 })
  })

  it('accepts 0 as "no minimum"', () => {
    expect(orderTypeSchema.parse({ ...baseInput, minimum_order_amount: 0 })).toMatchObject({
      minimum_order_amount: 0,
    })
  })

  it('stays optional so order types saved before the column keep validating', () => {
    expect(() => orderTypeSchema.parse(baseInput)).not.toThrow()
  })

  it('rejects a negative minimum, matching the database check constraint', () => {
    expect(() => orderTypeSchema.parse({ ...baseInput, minimum_order_amount: -1 })).toThrow()
  })
})

// ---- Admin form -----------------------------------------------------------

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
    type: 'delivery',
    name: 'Delivery',
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

describe('OrderTypeDetail — minimum order field', () => {
  beforeEach(() => {
    updateOrderTypeAction.mockReset()
    updateOrderTypeAction.mockResolvedValue({ success: true, data: makeOrderType() })
  })

  it('shows the merchant the saved minimum', () => {
    renderDetail({ minimum_order_amount: 500 })
    expect(screen.getByLabelText(/minimum order/i)).toHaveValue(500)
  })

  it('sends the typed minimum when the merchant saves', async () => {
    const user = userEvent.setup()
    renderDetail({ minimum_order_amount: 0 })

    const input = screen.getByLabelText(/minimum order/i)
    await user.clear(input)
    await user.type(input, '500')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateOrderTypeAction).toHaveBeenCalled()
    const settings = updateOrderTypeAction.mock.calls[0][3]
    expect(settings).toMatchObject({ minimum_order_amount: 500 })
  })

  it('explains that 0 means no minimum, so an empty field is not mistaken for a block', () => {
    renderDetail({ minimum_order_amount: 0 })
    expect(screen.getByText(/no minimum/i)).toBeInTheDocument()
  })
})
