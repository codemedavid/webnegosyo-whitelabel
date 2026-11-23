/**
 * The Delivery section (a tab before 2026-11-21) keyed on "has a quotation or
 * a fee", so a delivery order whose quotation was never stored (or expired and
 * cleared) had no way to reach the Lalamove controls at all.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { OrderDetailPanel } from '@/components/admin/order-detail-panel'
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

jest.mock('@/components/admin/order-delivery-card', () => ({
  OrderDeliveryCard: () => <div data-testid="delivery-card" />,
}))

describe('OrderDetailPanel delivery section', () => {
  test('shows the Delivery section for a delivery order with no quotation or fee', () => {
    render(<OrderDetailPanel order={order()} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} />)
    expect(screen.getByRole('region', { name: 'Delivery' })).toBeInTheDocument()
  })

  test('hides the Delivery section for a pickup order', () => {
    render(
      <OrderDetailPanel order={order({ order_type: 'pickup' })} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} />,
    )
    expect(screen.queryByRole('region', { name: 'Delivery' })).toBeNull()
  })

  test('offers the next step as one button, and none on a finished order', () => {
    const onAdvance = jest.fn()
    const { unmount } = render(
      <OrderDetailPanel order={order()} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} onAdvance={onAdvance} />,
    )
    screen.getByRole('button', { name: 'Confirm order' }).click()
    expect(onAdvance).toHaveBeenCalledWith(expect.objectContaining({ id: order().id }), { status: 'confirmed', label: 'Confirm' })
    unmount()
    render(
      <OrderDetailPanel order={order({ status: 'delivered' })} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} onAdvance={onAdvance} />,
    )
    for (const name of ['Confirm order', 'Start order', 'Ready order', 'Complete order']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  test('renders nothing while no order is open', () => {
    render(<OrderDetailPanel order={null} tenantSlug="seacook" tenantId="tenant-1" onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
