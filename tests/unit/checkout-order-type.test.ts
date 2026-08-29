/**
 * Regression: the selected order type persists in a GLOBAL localStorage key
 * shared across all tenants, so checkout could initialize with another
 * store's order-type ID. Every per-order-type fetch (payment methods,
 * customer form fields) then returns zero rows and the payment options
 * silently disappear.
 *
 * resolveActiveOrderType must only ever return an order type that belongs
 * to the current tenant.
 */
import { resolveActiveOrderType } from '@/lib/checkout-order-type'

interface TestOrderType {
  id: string
}

const dineIn: TestOrderType = { id: 'ot-dine-in' }
const delivery: TestOrderType = { id: 'ot-delivery' }
const enabled = [dineIn, delivery]

describe('resolveActiveOrderType', () => {
  it('keeps the stored order type when it belongs to the current tenant', () => {
    expect(resolveActiveOrderType('ot-delivery', enabled)).toBe('ot-delivery')
  })

  it('falls back to the first enabled order type when nothing is stored', () => {
    expect(resolveActiveOrderType(null, enabled)).toBe('ot-dine-in')
  })

  it("replaces another store's stale order type with the first enabled one", () => {
    expect(resolveActiveOrderType('ot-from-another-tenant', enabled)).toBe('ot-dine-in')
  })

  it('returns null when the tenant has no enabled order types', () => {
    expect(resolveActiveOrderType('ot-from-another-tenant', [])).toBeNull()
    expect(resolveActiveOrderType(null, [])).toBeNull()
  })
})
