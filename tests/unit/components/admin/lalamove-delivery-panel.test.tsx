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
