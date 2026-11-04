import {
  generateReferenceNumber,
  isReferenceNumber,
  SAFE_CHARS,
} from '@/lib/checkout-leads/reference-number'

describe('generateReferenceNumber', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns format WN-YYYYMMDD-XXXXXXXX', () => {
    const ref = generateReferenceNumber()
    expect(ref).toMatch(/^WN-\d{8}-[A-Z2-9]{8}$/)
  })

  it('uses the current date', () => {
    const ref = generateReferenceNumber()
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    expect(ref).toContain(today)
  })

  it('random part uses only safe characters', () => {
    for (let i = 0; i < 50; i++) {
      const ref = generateReferenceNumber()
      const randomPart = ref.split('-')[2]
      for (const char of randomPart) {
        expect(SAFE_CHARS).toContain(char)
      }
    }
  })

  it('generates unique values', () => {
    const refs = new Set<string>()
    for (let i = 0; i < 100; i++) {
      refs.add(generateReferenceNumber())
    }
    expect(refs.size).toBe(100)
  })

  it('does not draw its randomness from Math.random', () => {
    // Arrange: a predictable Math.random would make every ref identical
    jest.spyOn(Math, 'random').mockReturnValue(0)

    // Act
    const refs = new Set(Array.from({ length: 20 }, () => generateReferenceNumber()))

    // Assert
    expect(refs.size).toBe(20)
  })
})

describe('isReferenceNumber', () => {
  it('accepts a new 8-character reference', () => {
    expect(isReferenceNumber('WN-20261026-ABCD2345')).toBe(true)
  })

  it('still accepts a legacy 4-character reference', () => {
    expect(isReferenceNumber('WN-20260410-ABCD')).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['WN-20260410-ABC', 'too short'],
    ['WN-20260410-ABCDE', 'between lengths'],
    ['WN-20260410-abcd', 'lower case'],
    ['WN-20260410-ABC0', 'ambiguous character'],
    ['XX-20260410-ABCD', 'wrong prefix'],
    ['WN-2026041-ABCD', 'short date'],
  ])('refuses %p (%s)', (value) => {
    expect(isReferenceNumber(value)).toBe(false)
  })

  it('refuses a non-string', () => {
    expect(isReferenceNumber(42)).toBe(false)
    expect(isReferenceNumber(null)).toBe(false)
  })
})
