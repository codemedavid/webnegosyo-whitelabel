import type { Order, OrderItem } from '@/types/database'

export function createTestOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'test-order-1',
    tenant_id: 'test-tenant-1',
    order_type_id: undefined,
    order_type: undefined,
    customer_name: 'Test Customer',
    customer_contact: '1234567890',
    customer_data: {},
    items: [],
    total: 100,
    status: 'pending',
    delivery_fee: 0,
    lalamove_quotation_id: undefined,
    lalamove_order_id: undefined,
    lalamove_status: undefined,
    lalamove_driver_id: undefined,
    lalamove_driver_name: undefined,
    lalamove_driver_phone: undefined,
    lalamove_tracking_url: undefined,
    payment_method_id: undefined,
    payment_method_name: undefined,
    payment_method_details: undefined,
    payment_method_qr_code_url: undefined,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createTestOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    menu_item_id: 'test-item-1',
    menu_item_name: 'Test Item',
    variations: {},
    addons: [],
    quantity: 1,
    price: 100,
    subtotal: 100,
    special_instructions: undefined,
    ...overrides,
  }
}
