/**
 * Builders for single storage-neutral orders. Random orders come from the
 * shared generator, `tests/fixtures/report-orders.ts`.
 */
import type { ReportLine, ReportOrder, ReportPayment } from '@/lib/reports/sales-model'

export function line(overrides: Partial<ReportLine> = {}): ReportLine {
  return {
    id: 'line-1',
    menuItemId: 'dish-1',
    name: 'Adobo',
    categoryName: 'Mains',
    quantity: 1,
    subtotal: 100,
    ...overrides,
  }
}

export function payment(overrides: Partial<ReportPayment> = {}): ReportPayment {
  return { kind: 'charge', amount: 100, methodId: 'm-cash', methodName: 'Cash', at: Date.UTC(2026, 9, 1, 4), ...overrides }
}

export function order(overrides: Partial<ReportOrder> = {}): ReportOrder {
  return {
    id: 'order-1',
    at: Date.UTC(2026, 9, 1, 4),
    status: 'confirmed',
    paymentStatus: 'pending',
    channel: 'counter',
    orderType: 'Dine In',
    outletId: null,
    hasTable: false,
    total: 100,
    serviceCharge: null,
    deliveryFee: null,
    discount: null,
    methodId: 'm-cash',
    methodName: 'Cash',
    payments: [],
    lines: [line()],
    ...overrides,
  }
}
