import { describe, test, expect } from '@jest/globals'
import { bookingStepOneSchema, bookingStepTwoSchema } from '@/lib/booking/validation'

describe('bookingStepOneSchema', () => {
  test('accepts valid input', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+639171234567',
    })
    expect(result.success).toBe(true)
  })

  test('accepts phone starting with 0', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '09171234567',
    })
    expect(result.success).toBe(true)
  })

  test('strips formatting characters from phone', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '+63 917-123-4567',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe('+639171234567')
    }
  })

  test('rejects name shorter than 2 chars', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'A',
      email: 'maria@email.com',
      phone: '+639171234567',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid email', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'not-an-email',
      phone: '+639171234567',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid phone format', () => {
    const result = bookingStepOneSchema.safeParse({
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone: '12345',
    })
    expect(result.success).toBe(false)
  })
})

describe('bookingStepTwoSchema', () => {
  test('accepts valid date and time', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-04-01',
      bookingTime: '09:00',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid time format', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-04-01',
      bookingTime: '9am',
    })
    expect(result.success).toBe(false)
  })

  test('rejects weekend date', () => {
    const result = bookingStepTwoSchema.safeParse({
      bookingDate: '2026-03-28', // Saturday
      bookingTime: '09:00',
    })
    expect(result.success).toBe(false)
  })
})
