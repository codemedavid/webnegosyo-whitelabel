import { isLoyaltyLive, readLoyaltyTenantFlags } from '@/lib/loyalty/tenant-flags'

it('reads a store that is genuinely running loyalty', () => {
  expect(readLoyaltyTenantFlags({ loyalty_enabled: true, loyalty_shadow: false }))
    .toEqual({ isEnabled: true, isShadow: false })
  expect(isLoyaltyLive({ loyalty_enabled: true, loyalty_shadow: false })).toBe(true)
})

it('treats an unreadable or missing shadow flag as shadow', () => {
  expect(readLoyaltyTenantFlags({ loyalty_enabled: true })).toEqual({ isEnabled: true, isShadow: true })
  expect(readLoyaltyTenantFlags(null)).toEqual({ isEnabled: false, isShadow: true })
  expect(isLoyaltyLive({ loyalty_enabled: true })).toBe(false)
  expect(isLoyaltyLive(null)).toBe(false)
})

it('treats anything other than an explicit true as switched off', () => {
  expect(isLoyaltyLive({ loyalty_enabled: null, loyalty_shadow: false })).toBe(false)
  expect(isLoyaltyLive({ loyalty_shadow: false })).toBe(false)
})
