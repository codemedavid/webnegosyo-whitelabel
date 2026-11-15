import { manilaDay, manilaStamp } from '@/lib/assistant/insights/manila-stamp'

describe('Owl times are Manila times', () => {
  it('moves a UTC evening into the next Manila morning', () => {
    // 23:00 UTC on the 14th = 7:00 AM on the 15th in Manila.
    expect(manilaStamp('2026-11-14T23:00:00Z')).toBe('2026-11-15 7:00 AM')
    expect(manilaDay('2026-11-14T23:00:00Z')).toBe('2026-11-15')
  })

  it('keeps an afternoon on the same day', () => {
    expect(manilaStamp('2026-11-15T04:30:00+00:00')).toBe('2026-11-15 12:30 PM')
  })

  it('says nothing for a missing or unreadable time', () => {
    expect(manilaStamp(null)).toBeNull()
    expect(manilaStamp('not a date')).toBeNull()
    expect(manilaDay(undefined)).toBeNull()
  })
})
