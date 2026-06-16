import {
  getAdvanceOrderConfig,
  generateScheduleDates,
  generateTimeSlots,
  getFirstAvailableSlot,
  isValidScheduledTime,
  combineDateAndTime,
  formatScheduledFor,
  formatLeadTime,
  formatTime12,
  toDateValue,
  getOrderScheduledISO,
  getOrderScheduledLabel,
  type AdvanceOrderConfig,
} from '@/lib/advance-order-utils'

const baseConfig = (over: Partial<AdvanceOrderConfig> = {}): AdvanceOrderConfig => ({
  enabled: true,
  allowAsap: true,
  leadTimeMinutes: 30,
  maxDaysAhead: 7,
  slotIntervalMinutes: 30,
  ...over,
})

describe('getAdvanceOrderConfig', () => {
  it('applies safe defaults when fields are missing/null', () => {
    expect(getAdvanceOrderConfig(null)).toEqual({
      enabled: false,
      allowAsap: true,
      leadTimeMinutes: 30,
      maxDaysAhead: 7,
      slotIntervalMinutes: 30,
    })
  })

  it('reads provided columns', () => {
    expect(
      getAdvanceOrderConfig({
        advance_order_enabled: true,
        advance_order_allow_asap: false,
        advance_order_lead_time_minutes: 120,
        advance_order_max_days_ahead: 14,
        advance_order_slot_interval_minutes: 15,
      }),
    ).toEqual({
      enabled: true,
      allowAsap: false,
      leadTimeMinutes: 120,
      maxDaysAhead: 14,
      slotIntervalMinutes: 15,
    })
  })
})

describe('generateScheduleDates', () => {
  it('returns maxDaysAhead+1 days with Today/Tomorrow labels', () => {
    const now = new Date(2026, 5, 16, 10, 0, 0) // Tue Jun 16 2026, local
    const dates = generateScheduleDates(baseConfig({ maxDaysAhead: 3 }), now)
    expect(dates).toHaveLength(4)
    expect(dates[0].label).toBe('Today')
    expect(dates[0].value).toBe('2026-06-16')
    expect(dates[1].label).toBe('Tomorrow')
    expect(dates[2].label).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)
  })
})

describe('generateTimeSlots — lead time floor', () => {
  it('floors the first slot to now + lead (rounded up) for today', () => {
    const now = new Date(2026, 5, 16, 10, 10, 0) // 10:10
    const slots = generateTimeSlots(baseConfig({ leadTimeMinutes: 30, slotIntervalMinutes: 30 }), '2026-06-16', now)
    // 10:10 + 30m = 10:40 -> rounded up to 11:00
    expect(slots[0].value).toBe('11:00')
  })

  it('returns no slots for a past date', () => {
    const now = new Date(2026, 5, 16, 10, 0, 0)
    expect(generateTimeSlots(baseConfig(), '2026-06-15', now)).toEqual([])
  })

  it('applies the lead floor to FUTURE days too (24h catering lead)', () => {
    // Regression: long lead must not offer next-day slots inside the lead window.
    const now = new Date(2026, 5, 16, 10, 0, 0) // 10:00
    const config = baseConfig({ leadTimeMinutes: 1440, allowAsap: false }) // 24h
    // Today is fully inside the lead window -> empty.
    expect(generateTimeSlots(config, '2026-06-16', now)).toEqual([])
    // Tomorrow must start no earlier than now+24h = tomorrow 10:00.
    const tomorrow = generateTimeSlots(config, '2026-06-17', now)
    expect(tomorrow.length).toBeGreaterThan(0)
    expect(tomorrow[0].minutes).toBeGreaterThanOrEqual(10 * 60)
  })
})

describe('getFirstAvailableSlot ↔ isValidScheduledTime invariant', () => {
  // The seeded default in checkout MUST be a time the validator accepts; otherwise the
  // customer sees a pre-selected slot and gets bounced on submit.
  const leads = [30, 90, 840, 1440, 2880]
  const hours = [8, 10, 14, 20, 23]
  for (const lead of leads) {
    for (const h of hours) {
      it(`first slot is valid for lead=${lead}m at ${h}:00`, () => {
        const now = new Date(2026, 5, 16, h, 0, 0)
        const config = baseConfig({ leadTimeMinutes: lead, maxDaysAhead: 14 })
        const first = getFirstAvailableSlot(config, now)
        expect(first).not.toBeNull()
        const when = combineDateAndTime(first!.dateValue, first!.timeValue)
        expect(isValidScheduledTime(config, when, now)).toBe(true)
      })
    }
  }

  it('returns null when no slot fits the horizon (today-only, too late)', () => {
    const now = new Date(2026, 5, 16, 23, 30, 0)
    const config = baseConfig({ maxDaysAhead: 0, leadTimeMinutes: 30 })
    expect(getFirstAvailableSlot(config, now)).toBeNull()
  })
})

describe('isValidScheduledTime', () => {
  it('rejects times before the lead window and past the horizon', () => {
    const now = new Date(2026, 5, 16, 10, 0, 0)
    const config = baseConfig({ leadTimeMinutes: 60, maxDaysAhead: 2 })
    expect(isValidScheduledTime(config, new Date(2026, 5, 16, 10, 30, 0), now)).toBe(false) // inside lead
    expect(isValidScheduledTime(config, new Date(2026, 5, 16, 11, 30, 0), now)).toBe(true)
    expect(isValidScheduledTime(config, new Date(2026, 5, 20, 12, 0, 0), now)).toBe(false) // past horizon
  })
})

describe('formatting helpers', () => {
  it('formatTime12 is deterministic 12-hour', () => {
    expect(formatTime12(0)).toBe('12:00 AM')
    expect(formatTime12(13 * 60 + 5)).toBe('1:05 PM')
    expect(formatTime12(12 * 60)).toBe('12:00 PM')
  })

  it('formatScheduledFor roundtrips a local date deterministically', () => {
    const d = combineDateAndTime('2026-06-18', '17:30')
    expect(formatScheduledFor(d)).toBe('Thu, Jun 18 · 5:30 PM')
  })

  it('toDateValue uses the local calendar day', () => {
    expect(toDateValue(new Date(2026, 0, 5, 23, 0, 0))).toBe('2026-01-05')
  })

  it('formatLeadTime reads naturally', () => {
    expect(formatLeadTime(1)).toBe('1 minute')
    expect(formatLeadTime(30)).toBe('30 minutes')
    expect(formatLeadTime(60)).toBe('1 hour')
    expect(formatLeadTime(150)).toBe('2.5 hours')
  })
})

describe('order schedule readers', () => {
  it('getOrderScheduledISO prefers the column, falls back to customer_data', () => {
    expect(getOrderScheduledISO({ scheduled_for: '2026-06-18T09:30:00.000Z' })).toBe('2026-06-18T09:30:00.000Z')
    expect(getOrderScheduledISO({ customer_data: { scheduled_for: '2026-06-18T09:30:00.000Z' } })).toBe(
      '2026-06-18T09:30:00.000Z',
    )
    expect(getOrderScheduledISO({})).toBeNull()
    expect(getOrderScheduledISO(null)).toBeNull()
  })

  it('getOrderScheduledLabel prefers the captured label over formatting the ISO', () => {
    expect(
      getOrderScheduledLabel({ customer_data: { scheduled_for_label: 'Thu, Jun 18 · 5:30 PM' } }),
    ).toBe('Thu, Jun 18 · 5:30 PM')
    // Falls back to formatting an ISO when no label is present.
    const iso = combineDateAndTime('2026-06-18', '17:30').toISOString()
    expect(getOrderScheduledLabel({ scheduled_for: iso })).toBe('Thu, Jun 18 · 5:30 PM')
    expect(getOrderScheduledLabel({})).toBeNull()
  })
})
