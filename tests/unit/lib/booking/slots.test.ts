import { describe, test, expect } from '@jest/globals'
import { generateTimeSlots, isWeekday } from '@/lib/booking/slots'

describe('isWeekday', () => {
  test('returns true for Monday through Friday', () => {
    expect(isWeekday(new Date('2026-03-30T00:00:00Z'))).toBe(true)  // Mon
    expect(isWeekday(new Date('2026-03-31T00:00:00Z'))).toBe(true)  // Tue
    expect(isWeekday(new Date('2026-04-01T00:00:00Z'))).toBe(true)  // Wed
    expect(isWeekday(new Date('2026-04-02T00:00:00Z'))).toBe(true)  // Thu
    expect(isWeekday(new Date('2026-04-03T00:00:00Z'))).toBe(true)  // Fri
  })

  test('returns false for Saturday and Sunday', () => {
    expect(isWeekday(new Date('2026-03-28T00:00:00Z'))).toBe(false) // Sat
    expect(isWeekday(new Date('2026-03-29T00:00:00Z'))).toBe(false) // Sun
  })
})

describe('generateTimeSlots', () => {
  test('returns 16 slots for a weekday (9:00-16:30, 30min intervals)', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ time: '09:00', label: '9:00 AM', available: true })
    expect(slots[15]).toEqual({ time: '16:30', label: '4:30 PM', available: true })
  })

  test('returns empty array for weekends', () => {
    expect(generateTimeSlots(new Date('2026-03-28T00:00:00Z'))).toEqual([])
    expect(generateTimeSlots(new Date('2026-03-29T00:00:00Z'))).toEqual([])
  })

  test('slot times are 30 minutes apart', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots[0].time).toBe('09:00')
    expect(slots[1].time).toBe('09:30')
    expect(slots[2].time).toBe('10:00')
  })

  test('slot labels use 12-hour format', () => {
    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots[0].label).toBe('9:00 AM')
    expect(slots[8].label).toBe('1:00 PM')
  })

  test('excludes past times when date is today', () => {
    const now = new Date('2026-04-01T03:15:00Z') // 11:15 AM PHT (UTC+8)
    jest.useFakeTimers()
    jest.setSystemTime(now)

    const slots = generateTimeSlots(new Date('2026-04-01T00:00:00Z'))
    expect(slots[0].time).toBe('11:30')
    expect(slots.every(s => s.time >= '11:30')).toBe(true)

    jest.useRealTimers()
  })
})
