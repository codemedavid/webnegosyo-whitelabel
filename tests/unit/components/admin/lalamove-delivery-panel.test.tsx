/**
 * A checkout form with no phone field leaves `customer_contact` as ''. The
 * server now recovers the phone from customer_data or books with the store's
 * number, so the panel must not keep the button dead on a blank contact — that
 * left the merchant looking at a greyed-out "Create Lalamove Order" for every
 * such order.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('@/app/actions/lalamove', () => ({
  createLalamoveOrderAction: jest.fn(),
  requoteLalamoveAction: jest.fn(),
  cancelLalamoveOrderAction: jest.fn(),
  syncLalamoveOrderAction: jest.fn(),
  addPriorityFeeAction: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}))

import { toast } from 'sonner'
import * as lalamoveActions from '@/app/actions/lalamove'
import { LalamoveDeliveryPanel } from '@/components/admin/lalamove-delivery-panel'
import type { OrderWithItems } from '@/lib/orders-service'

const actions = lalamoveActions as unknown as Record<keyof typeof lalamoveActions, jest.Mock>
const toastMocks = toast as unknown as Record<'success' | 'error' | 'info', jest.Mock>

const order = (overrides: Partial<OrderWithItems> = {}) =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    order_type: 'delivery',
    status: 'pending',
    customer_name: 'Ana',
    customer_contact: '',
    customer_data: { delivery_address: 'Lucena', phone: '0917 123 4567' },
    delivery_fee: 60,
    lalamove_quotation_id: 'Q-1',
    lalamove_order_id: null,
    total: 500,
    order_items: [],
    ...overrides,
  }) as unknown as OrderWithItems

beforeEach(() => jest.clearAllMocks())

describe('LalamoveDeliveryPanel', () => {
  test('books with a blank customer contact and relays the store-phone notice', async () => {
    actions.createLalamoveOrderAction.mockResolvedValue({
      success: true,
      recipientPhoneSource: 'store',
    })
    render(<LalamoveDeliveryPanel order={order()} tenantId="tenant-1" />)

    const button = screen.getByRole('button', { name: /create lalamove order/i })
    expect(button).toBeEnabled()
    expect(screen.queryByText(/customer contact information is required/i)).toBeNull()

    fireEvent.click(button)

    await waitFor(() => expect(actions.createLalamoveOrderAction).toHaveBeenCalled())
    expect(toastMocks.info).toHaveBeenCalledTimes(1)
  })

  test('offers a quote for a delivery order that has none', () => {
    render(
      <LalamoveDeliveryPanel
        order={order({ lalamove_quotation_id: undefined, delivery_fee: undefined })}
        tenantId="tenant-1"
      />,
    )

    expect(screen.getByRole('button', { name: /get lalamove quote/i })).toBeInTheDocument()
  })
})

describe('LalamoveDeliveryPanel — rebooking a dead delivery', () => {
  const cancelled = () =>
    order({ lalamove_order_id: 'LM-old', lalamove_status: 'CANCELED' } as Partial<OrderWithItems>)

  beforeEach(() => {
    jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('a cancelled delivery can be rebooked: fresh quote, then a new rider on it', async () => {
    // One accidental Cancel used to leave only "Sync Status" — no way to get
    // the customer a rider again.
    actions.requoteLalamoveAction.mockResolvedValue({
      success: true,
      data: { quotationId: 'Q-new', price: '70', currency: 'PHP' },
    })
    actions.createLalamoveOrderAction.mockResolvedValue({ success: true })
    render(<LalamoveDeliveryPanel order={cancelled()} tenantId="tenant-1" />)

    fireEvent.click(screen.getByRole('button', { name: /rebook delivery/i }))

    await waitFor(() => expect(actions.createLalamoveOrderAction).toHaveBeenCalled())
    expect(actions.requoteLalamoveAction).toHaveBeenCalledWith('tenant-1', cancelled().id)
    // Booked against the NEW quotation, not the dead one still in props.
    expect(actions.createLalamoveOrderAction.mock.calls[0][2]).toBe('Q-new')
    expect(toastMocks.success).toHaveBeenCalled()
  })

  test('does not book when the fresh quote is refused', async () => {
    actions.requoteLalamoveAction.mockResolvedValue({ success: false, error: 'No pickup pin' })
    render(<LalamoveDeliveryPanel order={cancelled()} tenantId="tenant-1" />)

    fireEvent.click(screen.getByRole('button', { name: /rebook delivery/i }))

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('No pickup pin'))
    expect(actions.createLalamoveOrderAction).not.toHaveBeenCalled()
  })

  test('asks before dispatching — declining books nothing', async () => {
    ;(window.confirm as jest.Mock).mockReturnValue(false)
    render(<LalamoveDeliveryPanel order={cancelled()} tenantId="tenant-1" />)

    fireEvent.click(screen.getByRole('button', { name: /rebook delivery/i }))

    expect(actions.requoteLalamoveAction).not.toHaveBeenCalled()
  })

  test('offers no rebook for a live or completed delivery', () => {
    const { rerender } = render(
      <LalamoveDeliveryPanel
        order={order({ lalamove_order_id: 'LM-1', lalamove_status: 'ON_GOING' } as Partial<OrderWithItems>)}
        tenantId="tenant-1"
      />,
    )
    expect(screen.queryByRole('button', { name: /rebook delivery/i })).toBeNull()

    rerender(
      <LalamoveDeliveryPanel
        order={order({ lalamove_order_id: 'LM-1', lalamove_status: 'COMPLETED' } as Partial<OrderWithItems>)}
        tenantId="tenant-1"
      />,
    )
    expect(screen.queryByRole('button', { name: /rebook delivery/i })).toBeNull()
  })
})
