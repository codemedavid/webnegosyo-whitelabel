import { toDatetimeLocalValue } from '@/lib/datetime-local'

describe('toDatetimeLocalValue', () => {
  test('round-trips through the input without moving the instant', () => {
    // Arrange: what the voucher form stores when an owner types a time.
    const stored = new Date('2026-12-31T23:59').toISOString()

    // Act
    const shown = toDatetimeLocalValue(stored)

    // Assert: the field shows what was typed, whatever the machine's timezone.
    expect(shown).toBe('2026-12-31T23:59')
    expect(new Date(shown).toISOString()).toBe(stored)
  })

  test('is empty for a missing or unreadable value', () => {
    expect(toDatetimeLocalValue(null)).toBe('')
    expect(toDatetimeLocalValue(undefined)).toBe('')
    expect(toDatetimeLocalValue('not a date')).toBe('')
  })
})
