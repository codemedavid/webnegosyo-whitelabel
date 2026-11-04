import { addDays, daysBetween, manilaDateOf, manilaHourOf, todayInManila } from '@/lib/expenses/manila-date'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

describe('manila dates', () => {
  it('todayInManila rolls over at Manila midnight, not UTC', () => {
    expect(todayInManila(new Date('2026-10-20T15:59:59.999Z'))).toBe('2026-10-20')
    expect(todayInManila(new Date('2026-10-20T16:00:00.000Z'))).toBe('2026-10-21')
  })

  it('manilaDateOf agrees with the inventory business-day rule', () => {
    for (const iso of ['2026-10-20T15:59:59Z', '2026-10-20T16:00:00Z', '2026-12-31T20:00:00+00:00', '2024-02-28T17:00:00Z']) {
      expect(manilaDateOf(iso)).toBe(toBusinessDayKey(iso))
    }
  })

  it('manilaHourOf reads the Manila wall clock', () => {
    expect(manilaHourOf('2026-10-20T15:30:00Z')).toBe(23)
    expect(manilaHourOf('2026-10-20T22:00:00Z')).toBe(6)
  })

  it('rejects timestamps it cannot read', () => {
    expect(() => manilaDateOf('not a date')).toThrow(/ISO timestamp/)
    expect(() => manilaHourOf('')).toThrow(/ISO timestamp/)
  })

  it('steps and measures calendar days across months and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-21', -60)).toBe('2026-08-22')
    expect(daysBetween('2026-10-19', '2026-10-21')).toBe(2)
    expect(daysBetween('2026-10-21', '2026-10-19')).toBe(-2)
    expect(() => addDays('2026-13-01', 1)).toThrow(/YYYY-MM-DD/)
    expect(() => daysBetween('2026-10-21', 'x')).toThrow(/YYYY-MM-DD/)
  })
})
