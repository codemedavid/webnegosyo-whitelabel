/**
 * As-you-type formatting for the PH mobile field on the loyalty stamp card.
 *
 * The visible grouping (`0917 123 4567`) is purely cosmetic: what leaves the
 * form is the canonical E.164 identity from `normalizePhoneE164`, so the
 * customer's stamps and their online orders join into one card.
 */
import { formatPhMobileInput, toPhMobileE164 } from '@/lib/phone-display'

describe('formatPhMobileInput', () => {
  it('groups a local mobile number as it is typed', () => {
    expect(formatPhMobileInput('0')).toBe('0')
    expect(formatPhMobileInput('0917')).toBe('0917')
    expect(formatPhMobileInput('09171')).toBe('0917 1')
    expect(formatPhMobileInput('0917123')).toBe('0917 123')
    expect(formatPhMobileInput('09171234567')).toBe('0917 123 4567')
  })

  it('strips everything that is not a digit', () => {
    expect(formatPhMobileInput('0917-123-4567')).toBe('0917 123 4567')
    expect(formatPhMobileInput('(0917) 123 4567')).toBe('0917 123 4567')
  })

  it('keeps an international prefix readable', () => {
    expect(formatPhMobileInput('+639171234567')).toBe('+63 917 123 4567')
    expect(formatPhMobileInput('639171234567')).toBe('+63 917 123 4567')
  })

  it('never grows past a full number', () => {
    expect(formatPhMobileInput('091712345678999')).toBe('0917 123 4567')
  })

  it('returns an empty string for empty input', () => {
    expect(formatPhMobileInput('')).toBe('')
    expect(formatPhMobileInput('   ')).toBe('')
  })
})

describe('toPhMobileE164', () => {
  it('returns the canonical identity for a complete number', () => {
    expect(toPhMobileE164('0917 123 4567')).toBe('+639171234567')
    expect(toPhMobileE164('+63 917 123 4567')).toBe('+639171234567')
  })

  it('returns null while the number is incomplete or not a mobile', () => {
    expect(toPhMobileE164('0917 123')).toBeNull()
    expect(toPhMobileE164('0281234567')).toBeNull()
    expect(toPhMobileE164('')).toBeNull()
  })
})
