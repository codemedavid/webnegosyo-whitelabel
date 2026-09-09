/**
 * The Delivery tab keyed on "has a quotation or a fee", so a delivery order
 * whose quotation was never stored (or expired and cleared) had no way to
 * reach the Lalamove controls at all — the tab simply wasn't there.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
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

const order = (overrides: Partial<OrderWithItems> = {}) =>
  ({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    tenant_id: 'tenant-1',
    order_type: 'delivery',
    status: 'pending',
    customer_name: 'Ana',
    customer_contact: '',
    customer_data: { delivery_address: 'Lucena' },
    delivery_fee: null,
    lalamove_quotation_id: null,
    lalamove_order_id: null,
    payment_status: 'pending',
    total: 500,
    created_at: '2026-09-09T00:00:00Z',
    order_items: [],
    ...overrides,
  }) as unknown as OrderWithItems

describe('OrderDetailDialog delivery tab', () => {
  test('shows the Delivery tab for a delivery order with no quotation or fee', () => {
    render(
      <OrderDetailDialog order={order()} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: /delivery/i })).toBeInTheDocument()
  })

  test('hides the Delivery tab for a pickup order', () => {
    render(
      <OrderDetailDialog
        order={order({ order_type: 'pickup' })}
        tenantSlug="seacook"
        tenantId="tenant-1"
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole('tab', { name: /delivery/i })).toBeNull()
  })
})
