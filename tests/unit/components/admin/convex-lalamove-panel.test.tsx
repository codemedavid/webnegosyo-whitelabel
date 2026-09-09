/**
 * The web admin's Convex order sheet used to show Lalamove status read-only:
 * a merchant on a Convex backend had no Book / Quote / Sync / Cancel at all,
 * while the Supabase dialog and the mobile app both did. This panel is the
 * Convex twin of `LalamoveDeliveryPanel`, driven by the deployment's own
 * `lalamove:*` actions.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// The factories run when the (hoisted) imports first load, so the registries
// are created inside them and read back through requireMock.
jest.mock('convex/react', () => {
  const registry: Record<string, jest.Mock> = {}
  return {
    __registry: registry,
    useAction: (ref: string) => {
      if (!registry[ref]) registry[ref] = jest.fn()
      return registry[ref]
    },
  }
})
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}))

import { toast } from 'sonner'
import { ConvexLalamovePanel } from '@/components/admin/convex-lalamove-panel'
import { STORE_PHONE_RECIPIENT_NOTICE } from '@/lib/lalamove-recipient'

const actionMocks = (jest.requireMock('convex/react') as { __registry: Record<string, jest.Mock> })
  .__registry
const toastMocks = toast as unknown as Record<'success' | 'error' | 'info', jest.Mock>

const deliveryOrder = (overrides: Record<string, unknown> = {}) => ({
  _id: 'jh7dv43kvfwcj57s4qy013sd0s8e0zh8',
  orderType: 'Delivery',
  deliveryAddress: 'Manuel S. Enverga University, Lucena',
  deliveryFee: 60,
  customerContact: '',
  lalamoveQuotationId: '3580216762543244275',
  ...overrides,
})

beforeEach(() => {
  for (const key of Object.keys(actionMocks)) delete actionMocks[key]
  jest.clearAllMocks()
})

describe('ConvexLalamovePanel', () => {
  test('books a quoted delivery even when the customer left no phone', async () => {
    const order = deliveryOrder()
    render(<ConvexLalamovePanel order={order} lalamoveEnabled />)

    const book = screen.getByRole('button', { name: /create lalamove order/i })
    expect(book).toBeEnabled()
    actionMocks['lalamove:bookLalamove'].mockResolvedValue({
      success: true,
      lalamoveOrderId: 'LM-1',
      recipientPhoneSource: 'store',
    })

    fireEvent.click(book)

    await waitFor(() =>
      expect(actionMocks['lalamove:bookLalamove']).toHaveBeenCalledWith({ orderId: order._id }),
    )
    expect(toastMocks.info).toHaveBeenCalledWith(STORE_PHONE_RECIPIENT_NOTICE)
  })

  test('offers a quote when a delivery has an address but no quotation', async () => {
    const order = deliveryOrder({ lalamoveQuotationId: undefined, deliveryFee: undefined })
    render(<ConvexLalamovePanel order={order} lalamoveEnabled />)

    expect(screen.queryByRole('button', { name: /create lalamove order/i })).toBeNull()
    actionMocks['lalamove:requoteLalamove'].mockResolvedValue({ success: true, price: '89' })

    fireEvent.click(screen.getByRole('button', { name: /get lalamove quote/i }))

    await waitFor(() =>
      expect(actionMocks['lalamove:requoteLalamove']).toHaveBeenCalledWith({ orderId: order._id }),
    )
    expect(toastMocks.success).toHaveBeenCalled()
  })

  test('surfaces the backend refusal instead of a generic failure', async () => {
    render(<ConvexLalamovePanel order={deliveryOrder()} lalamoveEnabled />)
    actionMocks['lalamove:bookLalamove'].mockResolvedValue({
      success: false,
      error: 'Quotation expired or no longer valid (410) — get a new quote',
    })

    fireEvent.click(screen.getByRole('button', { name: /create lalamove order/i }))

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Quotation expired or no longer valid (410) — get a new quote',
      ),
    )
  })

  test('shows sync and cancel once a rider is booked', () => {
    render(
      <ConvexLalamovePanel
        order={deliveryOrder({
          lalamoveOrderId: 'LM-1',
          lalamoveStatus: 'ASSIGNING_DRIVER',
          lalamoveTrackingUrl: 'https://share.lalamove.com/x',
        })}
        lalamoveEnabled
      />,
    )

    expect(screen.getByRole('button', { name: /sync status/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel delivery/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /track delivery/i })).toHaveAttribute(
      'href',
      'https://share.lalamove.com/x',
    )
    expect(screen.queryByRole('button', { name: /create lalamove order/i })).toBeNull()
  })

  test('renders nothing for a pickup order or a store without Lalamove', () => {
    const { container, rerender } = render(
      <ConvexLalamovePanel
        order={deliveryOrder({
          orderType: 'Pickup',
          deliveryAddress: undefined,
          deliveryFee: undefined,
          lalamoveQuotationId: undefined,
        })}
        lalamoveEnabled
      />,
    )
    expect(container).toBeEmptyDOMElement()

    rerender(<ConvexLalamovePanel order={deliveryOrder()} lalamoveEnabled={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
