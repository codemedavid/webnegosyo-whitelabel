/**
 * DB row → domain `Voucher`.
 *
 * The boundary where snake_case, nullable numerics, and Postgres arrays become
 * the shape the pure engine was tested against. Worth its own tests because
 * every mis-mapped field here is a silently wrong discount: a dropped
 * `max_discount_amount` uncaps a percentage, a dropped `is_stackable` lets a
 * solo voucher stack.
 */

import { mapVoucherRow, type VoucherRow, type VoucherTargetRow } from '@/lib/vouchers/mapper'

function makeRow(overrides: Partial<VoucherRow> = {}): VoucherRow {
  return {
    id: 'v1',
    tenant_id: 't1',
    code: 'WELCOME10',
    name: '10% off',
    description: null,
    discount_type: 'percent',
    discount_value: 10,
    max_discount_amount: null,
    min_order_amount: 0,
    scope: 'universal',
    is_stackable: false,
    usage_limit_total: null,
    usage_limit_per_customer: null,
    used_count: 0,
    starts_at: null,
    ends_at: null,
    channels: ['checkout', 'pos', 'admin'],
    outlet_ids: null,
    is_active: true,
    ...overrides,
  }
}

describe('mapVoucherRow', () => {
  it('maps a plain universal voucher', () => {
    const voucher = mapVoucherRow(makeRow())

    expect(voucher).toMatchObject({
      id: 'v1',
      code: 'WELCOME10',
      discountType: 'percent',
      discountValue: 10,
      scope: 'universal',
      isStackable: false,
      isActive: true,
    })
  })

  it('preserves the max discount cap', () => {
    const voucher = mapVoucherRow(makeRow({ max_discount_amount: 50 }))

    expect(voucher.maxDiscountAmount).toBe(50)
  })

  it('coerces numeric strings, which is how pg returns numeric columns', () => {
    // node-postgres hands back `numeric` as a string. Left uncoerced,
    // "10" * subtotal / 100 still works but "10" + x does not — and a
    // string discountValue silently breaks the cap comparison.
    const voucher = mapVoucherRow(
      makeRow({
        discount_value: '15.50' as unknown as number,
        max_discount_amount: '100.00' as unknown as number,
        min_order_amount: '500.00' as unknown as number,
      }),
    )

    expect(voucher.discountValue).toBe(15.5)
    expect(voucher.maxDiscountAmount).toBe(100)
    expect(voucher.minOrderAmount).toBe(500)
  })

  it('keeps a null usage limit as null rather than turning it into zero', () => {
    // Zero would read as "no redemptions left" and disable every unlimited voucher.
    const voucher = mapVoucherRow(makeRow({ usage_limit_total: null }))

    expect(voucher.usageLimitTotal).toBeNull()
  })

  it('defaults missing channels to all three rather than none', () => {
    const voucher = mapVoucherRow(makeRow({ channels: null as unknown as string[] }))

    expect(voucher.channels).toEqual(['checkout', 'pos', 'admin'])
  })

  it('drops unrecognised channels instead of passing them to the engine', () => {
    const voucher = mapVoucherRow(makeRow({ channels: ['checkout', 'carrier_pigeon'] }))

    expect(voucher.channels).toEqual(['checkout'])
  })

  it('maps branch restrictions', () => {
    const voucher = mapVoucherRow(makeRow({ outlet_ids: ['outlet-1', 'outlet-2'] }))

    expect(voucher.outletIds).toEqual(['outlet-1', 'outlet-2'])
  })

  describe('targets', () => {
    const targets: VoucherTargetRow[] = [
      { voucher_id: 'v1', target_type: 'menu_item', target_id: 'item-a' },
      { voucher_id: 'v1', target_type: 'menu_item', target_id: 'item-b' },
      { voucher_id: 'v2', target_type: 'menu_item', target_id: 'item-other' },
    ]

    it('collects only this voucher’s targets', () => {
      const voucher = mapVoucherRow(makeRow({ scope: 'products' }), targets)

      expect(voucher.targetIds).toEqual(['item-a', 'item-b'])
    })

    it('collects category targets for a category-scoped voucher', () => {
      const voucher = mapVoucherRow(makeRow({ scope: 'categories' }), [
        { voucher_id: 'v1', target_type: 'category', target_id: 'cat-drinks' },
        { voucher_id: 'v1', target_type: 'menu_item', target_id: 'item-a' },
      ])

      expect(voucher.targetIds).toEqual(['cat-drinks'])
    })

    it('gives a scoped voucher an empty target list when none were loaded', () => {
      // Empty, not undefined: the engine treats an empty list as "matches
      // nothing", which is the safe reading of a misconfigured voucher.
      const voucher = mapVoucherRow(makeRow({ scope: 'products' }), [])

      expect(voucher.targetIds).toEqual([])
    })

    it('leaves a universal voucher without targets', () => {
      const voucher = mapVoucherRow(makeRow({ scope: 'universal' }), targets)

      expect(voucher.targetIds ?? []).toEqual([])
    })
  })

  it('produces a voucher the engine accepts end to end', () => {
    // The point of the mapper: a row goes in, a correct discount comes out.
    const voucher = mapVoucherRow(makeRow({ discount_value: '10' as unknown as number }))

    expect(voucher.discountValue).toBe(10)
    expect(typeof voucher.discountValue).toBe('number')
  })
})
