import { normalizeLalamovePhone, isE164Phone } from '@/lib/lalamove-phone'

describe('normalizeLalamovePhone', () => {
  describe('empty / invalid input', () => {
    test('returns undefined for null/undefined/empty', () => {
      expect(normalizeLalamovePhone(undefined, 'PH')).toBeUndefined()
      expect(normalizeLalamovePhone(null, 'PH')).toBeUndefined()
      expect(normalizeLalamovePhone('', 'PH')).toBeUndefined()
      expect(normalizeLalamovePhone('   ', 'PH')).toBeUndefined()
    })

    test('returns undefined when there are no digits', () => {
      expect(normalizeLalamovePhone('abc', 'PH')).toBeUndefined()
    })
  })

  describe('already E.164', () => {
    test('passes through a +-prefixed number unchanged', () => {
      expect(normalizeLalamovePhone('+639171234567', 'PH')).toBe('+639171234567')
      expect(normalizeLalamovePhone('+85256847123', 'HK')).toBe('+85256847123')
    })
  })

  describe('PH market', () => {
    test('converts 09xxxxxxxxx to +639xxxxxxxxx', () => {
      expect(normalizeLalamovePhone('09171234567', 'PH')).toBe('+639171234567')
    })

    test('converts bare 9xxxxxxxxx (10 digits) to +639xxxxxxxxx', () => {
      expect(normalizeLalamovePhone('9171234567', 'PH')).toBe('+639171234567')
    })

    test('converts 639xxxxxxxxx to +639xxxxxxxxx', () => {
      expect(normalizeLalamovePhone('639171234567', 'ph')).toBe('+639171234567')
    })

    test('strips formatting characters before normalizing', () => {
      expect(normalizeLalamovePhone('0917-123-4567', 'PH')).toBe('+639171234567')
      expect(normalizeLalamovePhone('(0917) 123 4567', 'PH')).toBe('+639171234567')
    })
  })

  describe('non-PH market', () => {
    test('prefixes a + assuming country code is present', () => {
      expect(normalizeLalamovePhone('85256847123', 'HK')).toBe('+85256847123')
    })

    test('treats missing market as non-PH', () => {
      expect(normalizeLalamovePhone('85256847123', undefined)).toBe('+85256847123')
    })
  })
})

describe('normalizeLalamovePhone — already-prefixed numbers with formatting', () => {
  test('strips spaces and dashes inside a + number instead of passing them through', () => {
    // A merchant typed "+63 917 123 4567" into the pickup phone; Lalamove
    // rejects anything but bare E.164.
    expect(normalizeLalamovePhone('+63 917-123 4567', 'PH')).toBe('+639171234567')
    expect(normalizeLalamovePhone('+639081760718 ', 'PH')).toBe('+639081760718')
  })
})

describe('isE164Phone', () => {
  test('accepts a bare E.164 number', () => {
    expect(isE164Phone('+639171234567')).toBe(true)
    expect(isE164Phone('+85256847123')).toBe(true)
  })

  test('rejects blanks, local formats and email addresses', () => {
    expect(isE164Phone('')).toBe(false)
    expect(isE164Phone(undefined)).toBe(false)
    expect(isE164Phone('09171234567')).toBe(false)
    expect(isE164Phone('ana@example.com')).toBe(false)
    expect(isE164Phone('+0917')).toBe(false)
  })
})
