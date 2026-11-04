/** @jest-environment node */
import { isPhilippineDeliveryMarket, resolveDeliveryMarket } from '@/lib/delivery/delivery-market'

describe('resolveDeliveryMarket', () => {
  it('uses the Lalamove market only while Lalamove is on', () => {
    expect(resolveDeliveryMarket({ lalamoveEnabled: true, market: 'HK' })).toBe('HK')
    expect(resolveDeliveryMarket({ lalamoveEnabled: true, market: ' sg ' })).toBe('SG')
  })

  it('treats a stale market on a store without Lalamove as the Philippines', () => {
    // 239 live stores carry lalamove_market = 'HK' as an old default with Lalamove off.
    expect(resolveDeliveryMarket({ lalamoveEnabled: false, market: 'HK' })).toBe('PH')
    expect(resolveDeliveryMarket({ lalamoveEnabled: null, market: 'HK' })).toBe('PH')
    expect(resolveDeliveryMarket({ market: 'HK' })).toBe('PH')
  })

  it('treats a blank, whitespace or missing market as the Philippines', () => {
    expect(resolveDeliveryMarket({ lalamoveEnabled: true, market: '' })).toBe('PH')
    expect(resolveDeliveryMarket({ lalamoveEnabled: true, market: '   ' })).toBe('PH')
    expect(resolveDeliveryMarket({ lalamoveEnabled: true, market: null })).toBe('PH')
    expect(resolveDeliveryMarket({ lalamoveEnabled: true })).toBe('PH')
  })
})

describe('isPhilippineDeliveryMarket', () => {
  it('is true for PH in any case and for every non-Lalamove store', () => {
    expect(isPhilippineDeliveryMarket({ lalamoveEnabled: true, market: 'ph' })).toBe(true)
    expect(isPhilippineDeliveryMarket({ lalamoveEnabled: false, market: 'HK' })).toBe(true)
    expect(isPhilippineDeliveryMarket({ lalamoveEnabled: true, market: '' })).toBe(true)
  })

  it('is false for a Lalamove store trading in another market', () => {
    expect(isPhilippineDeliveryMarket({ lalamoveEnabled: true, market: 'HK' })).toBe(false)
  })
})
