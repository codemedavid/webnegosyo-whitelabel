import type { SaleRecord } from '@/lib/dashboard/sale-record'

let sequence = 0

/** A completed counter sale unless overridden. */
export function makeSale(overrides: Partial<SaleRecord> & { at: number }): SaleRecord {
  sequence += 1
  return {
    id: `sale-${sequence}`,
    total: 100,
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'counter',
    orderType: 'Dine In',
    outletId: null,
    phone: null,
    items: [],
    ...overrides,
  }
}
