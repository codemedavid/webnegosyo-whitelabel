import { generateReferenceNumber, SAFE_CHARS } from '@/lib/checkout-leads/reference-number'

describe('generateReferenceNumber', () => {
  it('returns format WN-YYYYMMDD-XXXX', () => {
    const ref = generateReferenceNumber()
    expect(ref).toMatch(/^WN-\d{8}-[A-Z2-9]{4}$/)
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
})
