/**
 * Quiet hours HOLD a text until morning; they never drop it (Postscript's rule,
 * and the only one a guest thanks you for). Times are Manila wall clock, which
 * is UTC+8 all year.
 */

import { nextSendableAt, isQuietAt } from '@/lib/sms-automations/quiet-hours'

// 2026-10-12 22:30 Manila = 14:30Z
const LATE_EVENING = new Date('2026-10-12T14:30:00Z')
// 2026-10-13 06:00 Manila = 2026-10-12 22:00Z
const EARLY_MORNING = new Date('2026-10-12T22:00:00Z')
// 2026-10-12 12:00 Manila = 04:00Z
const NOON = new Date('2026-10-12T04:00:00Z')

describe('quiet hours (21:00–08:00 Manila)', () => {
  it('lets a midday text go now', () => {
    expect(isQuietAt(NOON, '21:00', '08:00')).toBe(false)
    expect(nextSendableAt(NOON, '21:00', '08:00').toISOString()).toBe(NOON.toISOString())
  })

  it('holds a late-evening text until 08:00 the next morning', () => {
    expect(isQuietAt(LATE_EVENING, '21:00', '08:00')).toBe(true)
    expect(nextSendableAt(LATE_EVENING, '21:00', '08:00').toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })

  it('holds an early-morning text until 08:00 the same morning', () => {
    expect(nextSendableAt(EARLY_MORNING, '21:00', '08:00').toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })

  it('treats equal start and end as "no quiet hours"', () => {
    expect(isQuietAt(LATE_EVENING, '00:00', '00:00')).toBe(false)
  })

  it('handles a window that does not cross midnight', () => {
    // 13:00–14:00 Manila siesta; 13:30 Manila = 05:30Z
    const siesta = new Date('2026-10-12T05:30:00Z')
    expect(nextSendableAt(siesta, '13:00', '14:00').toISOString()).toBe('2026-10-12T06:00:00.000Z')
  })
})
