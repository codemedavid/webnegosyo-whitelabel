import { clockLabel, dayLabel, longDayLabel, shiftTimesLabel, verdictPill, weekdayLabel } from '@/components/admin/cash/cash-format'

describe('cash-format', () => {
  it('reads Manila wall-clock times', () => {
    expect(clockLabel('2026-10-24T10:02:00.000Z')).toBe('6:02 PM')
    expect(shiftTimesLabel('2026-10-24T10:02:00.000Z', '2026-10-24T18:48:00.000Z')).toBe('6:02 PM – 2:48 AM')
    expect(shiftTimesLabel('2026-10-24T10:02:00.000Z', null)).toBe('6:02 PM – now')
  })

  it('names business days', () => {
    expect(dayLabel('2026-10-24')).toBe('Sat, Oct 24')
    expect(weekdayLabel('2026-10-24')).toBe('Saturday')
    expect(longDayLabel('2026-10-25')).toBe('Sunday, Oct 25')
  })

  it('gives every result a word, not only a colour; a missing count is never "Exact"', () => {
    expect(verdictPill({ kind: 'short', differenceCents: -12000 })).toEqual({ text: 'Short ₱120.00', tone: 'bad' })
    expect(verdictPill({ kind: 'over', differenceCents: 500 })).toEqual({ text: 'Over ₱5.00', tone: 'warn' })
    expect(verdictPill({ kind: 'exact', differenceCents: 0 })).toEqual({ text: 'Exact', tone: 'ok' })
    expect(verdictPill({ kind: 'uncounted', differenceCents: null }).text).toBe('Not counted')
    expect(verdictPill({ kind: 'open', differenceCents: null }).text).toBe('Still open')
  })
})
