import type { ReceiptOrder } from '@/lib/receipt-layout'

/** Deterministic sample sale for the Studio preview — never real data. */
export const SAMPLE_ORDER: ReceiptOrder = {
  _id: 'sample-order-4821',
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: 'Maria',
  customerContact: '09171234567',
  orderType: 'Dine-in',
  // A seated sample carrying the answers a checkout collects, so the table,
  // address and checkout-answer blocks all preview with values rather than
  // silence — a merchant arranging a block that renders nothing cannot tell
  // an empty sample from a broken layout.
  customerData: {
    table_number: '12',
    delivery_address: '24 Rizal Street, Barangay San Jose, Quezon City',
    landmark: 'Beside the blue gate',
    email: 'maria@example.com',
  },
  // Both fees are on the sample deliberately. A merchant arranging their
  // totals block has to SEE where a service charge and a delivery fee land;
  // without them the preview jumped from the items straight to TOTAL and the
  // rows were first discovered on a live chit.
  serviceCharge: 37.25,
  deliveryFee: 50,
  total: 459.75,
  paymentMethod: 'Cash',
  cashTendered: 500,
  changeDue: 40.25,
  items: [
    { menuItemName: 'Iced Latte', quantity: 2, subtotal: 240, variation: 'Large' },
    { menuItemName: 'Ham & Cheese Croissant', quantity: 1, subtotal: 132.5 },
  ],
}

/** Stands in for the signed tracking link the printer mints per order. */
export const SAMPLE_TRACKING_URL = 'https://webnegosyo.com/order/sample?t=0000000000'
