/**
 * A merchant reading a delivery order saw the address as text only: the
 * customer's pin was hidden, so a vague address could not be checked on a map.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderDetailDialog } from '@/components/admin/order-detail-dialog'
import type { OrderWithItems } from '@/lib/orders-service'

jest.mock('@/components/admin/order-status-management', () => ({
  OrderStatusManagement: () => <div data-testid="status-management" />,
}))
jest.mock('@/components/admin/order-items-display', () => ({
  OrderItemsDisplay: () => <div data-testid="items-display" />,
}))
jest.mock('@/components/admin/lalamove-delivery-panel', () => ({
  LalamoveDeliveryPanel: () => <div data-testid="lalamove-panel" />,
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

const order = (customerData: Record<string, unknown>) =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    order_type: 'delivery',
    status: 'pending',
    customer_name: 'Ana',
    customer_contact: '',
    customer_data: customerData,
    delivery_fee: 80,
    lalamove_quotation_id: null,
    lalamove_order_id: null,
    payment_status: 'pending',
    total: 500,
    created_at: '2026-09-09T00:00:00Z',
    order_items: [],
  }) as unknown as OrderWithItems

async function renderDialog(customerData: Record<string, unknown>) {
  const user = userEvent.setup()
  render(<OrderDetailDialog order={order(customerData)} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} />)
  await user.click(screen.getByRole('tab', { name: /customer/i }))
}

describe('OrderDetailDialog map link', () => {
  test('opens the exact pin in Google Maps from the address row', async () => {
    await renderDialog({ delivery_address: '12 Mabini St', delivery_lat: '14.5861', delivery_lng: '121.1761', delivery_landmark: 'Blue gate' })
    const link = screen.getByRole('link', { name: /open in google maps/i })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=14.5861,121.1761')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Landmark')).toBeInTheDocument()
    expect(screen.getByText('Blue gate')).toBeInTheDocument()
  })

  test('searches the address text when the order has no pin', async () => {
    await renderDialog({ delivery_address: 'Purok 3, Lucena' })
    expect(screen.getByRole('link', { name: /open in google maps/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Purok%203%2C%20Lucena',
    )
  })

  test('puts the link on the address row only', async () => {
    await renderDialog({ delivery_address: '12 Mabini St', delivery_lat: '14.5861', delivery_lng: '121.1761', landmark: 'Near Petron' })
    expect(screen.getAllByRole('link', { name: /open in google maps/i })).toHaveLength(1)
  })
})
