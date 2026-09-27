import { formatClientTenure, initialsOf, shortLocality } from '@/lib/superadmin/client-map/display'

describe('shortLocality', () => {
  it('keeps the city and province, dropping country and postal codes', () => {
    expect(shortLocality('Brgy. Sampaga, Balayan, Batangas, Philippines, 4213')).toBe('Balayan, Batangas')
  })

  it('collapses a repeated city', () => {
    expect(shortLocality('186b JP Rizal, Quezon City, Quezon City, Philippines')).toBe('186b JP Rizal, Quezon City')
  })

  it('handles single-part and empty addresses', () => {
    expect(shortLocality('Metro Manila')).toBe('Metro Manila')
    expect(shortLocality(null)).toBeNull()
    expect(shortLocality('Philippines')).toBeNull()
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Kape Tayo Cafe')).toBe('KT')
    expect(initialsOf('  baksilog ')).toBe('B')
    expect(initialsOf('11.21 CAFE & CHILL')).toBe('1C')
    expect(initialsOf('')).toBe('?')
  })
})

describe('formatClientTenure', () => {
  const now = new Date('2026-09-24T00:00:00Z')

  it('describes days, months and years', () => {
    expect(formatClientTenure('2026-09-20T00:00:00Z', now)).toBe('4 days')
    expect(formatClientTenure('2026-09-24T00:00:00Z', now)).toBe('Joined today')
    expect(formatClientTenure('2026-06-01T00:00:00Z', now)).toBe('3 months')
    expect(formatClientTenure('2025-08-01T00:00:00Z', now)).toBe('1 year')
    expect(formatClientTenure('2024-01-01T00:00:00Z', now)).toBe('2 years')
  })

  it('returns null for an unparseable date', () => {
    expect(formatClientTenure('nope', now)).toBeNull()
  })
})
