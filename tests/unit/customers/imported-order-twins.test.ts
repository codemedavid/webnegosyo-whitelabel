/**
 * One real order, two records.
 *
 * Convex→platform history imports copied each Convex order into `orders`,
 * stamping the Convex id into `customer_data.convex_order_id`. Some of those
 * orders were ALSO projected into `customer_external_orders` while the store
 * still ran on Convex (`external_order_id` = the same Convex id). A reader that
 * unions both tables must count that order once — the platform row wins.
 */

import { describe, it, expect } from '@jest/globals'
import { convexOriginOf, dedupeOrderSources } from '@/lib/customers/imported-order-twins'

describe('convexOriginOf', () => {
  it('reads the Convex id an imported platform order carries', () => {
    expect(convexOriginOf({ convex_order_id: 'jh70mwef055zxzpv' })).toBe('jh70mwef055zxzpv')
  })

  it('treats a native platform order, a blank id and junk data as having no origin', () => {
    expect(convexOriginOf({ delivery_address: '12 Mabini St' })).toBeNull()
    expect(convexOriginOf({ convex_order_id: '   ' })).toBeNull()
    expect(convexOriginOf({ convex_order_id: 42 })).toBeNull()
    expect(convexOriginOf(null)).toBeNull()
    expect(convexOriginOf('convex_order_id')).toBeNull()
  })
})

describe('dedupeOrderSources', () => {
  const platform = [
    { id: 'p-imported', customer_data: { convex_order_id: 'cx-1' } },
    { id: 'p-native', customer_data: {} },
  ]

  it('drops the ledger copy of an order the platform also holds, keeping the platform row', () => {
    const ledger = [
      { id: 'l-twin', backend: 'convex', external_order_id: 'cx-1' },
      { id: 'l-only', backend: 'convex', external_order_id: 'cx-2' },
    ]

    const result = dedupeOrderSources(platform, ledger)

    expect(result.platform).toEqual(platform)
    expect(result.ledger.map((row) => row.id)).toEqual(['l-only'])
  })

  it('never drops a tenant-Supabase ledger row that happens to share an id string', () => {
    const ledger = [{ id: 'l-tenant', backend: 'tenant_supabase', external_order_id: 'cx-1' }]

    expect(dedupeOrderSources(platform, ledger).ledger).toEqual(ledger)
  })

  it('returns new arrays and leaves its inputs untouched', () => {
    const ledger = [{ id: 'l-twin', backend: 'convex', external_order_id: 'cx-1' }]
    const before = JSON.stringify({ platform, ledger })

    const result = dedupeOrderSources(platform, ledger)

    expect(result.ledger).not.toBe(ledger)
    expect(JSON.stringify({ platform, ledger })).toBe(before)
  })
})
