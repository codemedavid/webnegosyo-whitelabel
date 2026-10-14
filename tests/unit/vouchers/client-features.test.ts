import { clientSupportsUnitLimits, vouchersForClient } from '@/lib/vouchers/client-features'

describe('voucher client features', () => {
  it('only a client that announces "units" can price unit-limited vouchers', () => {
    expect(clientSupportsUnitLimits(null)).toBe(false)
    expect(clientSupportsUnitLimits('')).toBe(false)
    expect(clientSupportsUnitLimits('units')).toBe(true)
    expect(clientSupportsUnitLimits(' picks, UNITS ')).toBe(true)
  })

  it('withholds unit-limited vouchers from an old register', () => {
    const vouchers = [{ id: 'a', maxDiscountedUnits: null }, { id: 'b', maxDiscountedUnits: 1 }, { id: 'c' }]

    expect(vouchersForClient(vouchers, false).map((voucher) => voucher.id)).toEqual(['a', 'c'])
    expect(vouchersForClient(vouchers, true).map((voucher) => voucher.id)).toEqual(['a', 'b', 'c'])
  })
})
