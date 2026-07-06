import { describe, it, expect } from '@jest/globals'
import { normalizePhoneE164 } from '@/lib/phone'

/**
 * The phone identity key must be a single, deterministic normalizer so the same
 * person's orders join into one customer. It targets PH mobile numbers in E.164
 * (+639XXXXXXXXX) and returns null for anything it cannot confidently normalize,
 * so real-world dirty data never produces a junk customer.
 */
describe('normalizePhoneE164 (PH)', () => {
  describe('canonical PH mobile inputs all map to one E.164 key', () => {
    const canonical = '+639171234567'

    it.each([
      ['local 0-prefixed', '09171234567'],
      ['national 10-digit', '9171234567'],
      ['country-code without plus', '639171234567'],
      ['already E.164', '+639171234567'],
      ['spaces', '+63 917 123 4567'],
      ['dashes', '0917-123-4567'],
      ['parentheses and spaces', '(0917) 123 4567'],
      ['00 international prefix', '00639171234567'],
      ['leading/trailing whitespace', '  09171234567  '],
    ])('normalizes %s -> +639171234567', (_label, input) => {
      expect(normalizePhoneE164(input)).toBe(canonical)
    })
  })

  describe('dirty / unusable data returns null (never a junk key)', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['letters only', 'abcdef'],
      ['POS placeholder', 'POS'],
      ['walk-in placeholder', 'walk-in'],
      ['too short', '12345'],
      ['n/a', 'N/A'],
    ])('returns null for %s', (_label, input) => {
      expect(normalizePhoneE164(input)).toBeNull()
    })

    it('returns null for null input', () => {
      expect(normalizePhoneE164(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(normalizePhoneE164(undefined)).toBeNull()
    })
  })

  it('is idempotent: normalizing an already-normalized value is a no-op', () => {
    const once = normalizePhoneE164('0917 123 4567')
    expect(once).toBe('+639171234567')
    expect(normalizePhoneE164(once)).toBe(once)
  })

  it('never returns a value that is not valid E.164 PH mobile shape', () => {
    const result = normalizePhoneE164('09171234567')
    expect(result).toMatch(/^\+639\d{9}$/)
  })
})
