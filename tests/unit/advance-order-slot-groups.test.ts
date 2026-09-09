/**
 * The checkout scheduler's presentation helpers: time slots grouped into
 * the parts of the day, and a date option broken into the three lines a
 * date card shows.
 */

import { groupTimeSlotsByPeriod, describeScheduleDate, generateTimeSlots, type AdvanceOrderConfig } from '@/lib/advance-order-utils'

const config: AdvanceOrderConfig = { enabled: true, allowAsap: true, leadTimeMinutes: 0, maxDaysAhead: 7, slotIntervalMinutes: 60 }
const NOW = new Date(2026, 5, 15, 6, 0, 0, 0)

describe('groupTimeSlotsByPeriod', () => {
  it('splits a full day into morning, afternoon and evening', () => {
    const groups = groupTimeSlotsByPeriod(generateTimeSlots(config, '2026-06-16', NOW))
    expect(groups.map((g) => g.label)).toEqual(['Morning', 'Afternoon', 'Evening'])
    expect(groups[0].slots.map((s) => s.label)).toEqual(['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM'])
    expect(groups[1].slots[0].label).toBe('12:00 PM')
    expect(groups[2].slots[0].label).toBe('5:00 PM')
  })

  it('drops a part of the day with no slots', () => {
    const evening = generateTimeSlots(config, '2026-06-16', NOW).filter((s) => s.minutes >= 18 * 60)
    expect(groupTimeSlotsByPeriod(evening).map((g) => g.label)).toEqual(['Evening'])
  })

  it('is empty for no slots', () => {
    expect(groupTimeSlotsByPeriod([])).toEqual([])
  })
})

describe('describeScheduleDate', () => {
  it('keeps Today and Tomorrow as the headline', () => {
    expect(describeScheduleDate({ value: '2026-06-15', label: 'Today', isToday: true }))
      .toEqual({ headline: 'Today', day: '15', month: 'Jun' })
    expect(describeScheduleDate({ value: '2026-06-16', label: 'Tomorrow', isToday: false }))
      .toEqual({ headline: 'Tomorrow', day: '16', month: 'Jun' })
  })

  it('uses the weekday for any other date', () => {
    expect(describeScheduleDate({ value: '2026-06-18', label: 'Thu, Jun 18', isToday: false }))
      .toEqual({ headline: 'Thu', day: '18', month: 'Jun' })
  })
})
