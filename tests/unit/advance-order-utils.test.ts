import {
  getAdvanceOrderConfig,
  generateScheduleDates,
  generateTimeSlots,
  getFirstAvailableSlot,
  isValidScheduledTime,
  formatScheduledFor,
  formatLeadTime,
  minutesToTimeValue,
  combineDateAndTime,
  type AdvanceOrderConfig,
} from '@/lib/advance-order-utils'
import { buildDefaultOperatingHours, type OperatingHours } from '@/lib/operating-hours'

const baseConfig: AdvanceOrderConfig = {
  enabled: true,
  allowAsap: true,
  leadTimeMinutes: 30,
  maxDaysAhead: 7,
  slotIntervalMinutes: 30,
}

// Fixed reference "now": June 15 2026, 10:00 local time.
const NOW = new Date(2026, 5, 15, 10, 0, 0, 0)

/** Operating hours where every day is open in [open, close]. */
function openHours(open: string, close: string): OperatingHours {
  return buildDefaultOperatingHours(open, close)
}

/** Operating hours where only `date`'s weekday is closed (others default-open). */
function closedOnDayOf(date: Date): OperatingHours {
  const hours = buildDefaultOperatingHours()
  hours[String(date.getDay())] = { closed: true, open: '00:00', close: '00:00' }
  return hours
}

describe('getAdvanceOrderConfig', () => {
  test('disabled with sane defaults for null', () => {
    expect(getAdvanceOrderConfig(null)).toEqual({
      enabled: false,
      allowAsap: true,
      leadTimeMinutes: 30,
      maxDaysAhead: 7,
      slotIntervalMinutes: 30,
    })
  })

  test('reads enabled + allow_asap flags', () => {
    const cfg = getAdvanceOrderConfig({
      advance_order_enabled: true,
      advance_order_allow_asap: false,
      advance_order_lead_time_minutes: 120,
      advance_order_max_days_ahead: 14,
      advance_order_slot_interval_minutes: 15,
    })
    expect(cfg).toEqual({
      enabled: true,
      allowAsap: false,
      leadTimeMinutes: 120,
      maxDaysAhead: 14,
      slotIntervalMinutes: 15,
    })
  })

  test('falls back when slot interval is below the minimum', () => {
    const cfg = getAdvanceOrderConfig({ advance_order_enabled: true, advance_order_slot_interval_minutes: 1 })
    expect(cfg.slotIntervalMinutes).toBe(30)
  })
})

describe('generateScheduleDates', () => {
  test('returns maxDaysAhead + 1 days with Today/Tomorrow labels when no hours', () => {
    const dates = generateScheduleDates(baseConfig, NOW)
    expect(dates).toHaveLength(8)
    expect(dates[0]).toMatchObject({ label: 'Today', isToday: true })
    expect(dates[1]).toMatchObject({ label: 'Tomorrow', isToday: false })
  })

  test('excludes days the store is closed', () => {
    const closedDate = new Date(2026, 5, 17, 0, 0, 0, 0)
    const hours = closedOnDayOf(closedDate)
    const dates = generateScheduleDates(baseConfig, NOW, hours)
    expect(dates.some((d) => d.value === '2026-06-17')).toBe(false)
    expect(dates.some((d) => d.value === '2026-06-16')).toBe(true)
  })
})

describe('generateTimeSlots', () => {
  test('default window 08:00–22:00 when no hours, excluding past slots today by lead time', () => {
    const slots = generateTimeSlots(baseConfig, '2026-06-15', NOW)
    // NOW 10:00 + 30m lead = 10:30 → first slot 10:30.
    expect(slots[0].value).toBe('10:30')
    expect(slots[slots.length - 1].value).toBe('22:00')
  })

  test('a future day starts at the window open with no lead-time trimming', () => {
    const slots = generateTimeSlots(baseConfig, '2026-06-16', NOW)
    expect(slots[0].value).toBe('08:00')
    expect(slots[slots.length - 1].value).toBe('22:00')
  })

  test('respects a custom operating-hours window', () => {
    const slots = generateTimeSlots(baseConfig, '2026-06-16', NOW, openHours('11:00', '21:00'))
    expect(slots[0].value).toBe('11:00')
    expect(slots[slots.length - 1].value).toBe('21:00')
  })

  test('returns [] for a closed day', () => {
    const closedDate = new Date(2026, 5, 16, 0, 0, 0, 0)
    const slots = generateTimeSlots(baseConfig, '2026-06-16', NOW, closedOnDayOf(closedDate))
    expect(slots).toEqual([])
  })

  test('honors slot interval', () => {
    const cfg = { ...baseConfig, slotIntervalMinutes: 60 }
    const slots = generateTimeSlots(cfg, '2026-06-16', NOW)
    expect(slots.map((s) => s.value).slice(0, 3)).toEqual(['08:00', '09:00', '10:00'])
  })
})

describe('getFirstAvailableSlot', () => {
  test('returns the first selectable slot today', () => {
    const first = getFirstAvailableSlot(baseConfig, NOW)
    expect(first).toEqual({ dateValue: '2026-06-15', timeValue: '10:30' })
  })

  test('skips closed days to the next open day', () => {
    // closedOnDayOf uses the default 09:00–21:00 window for the other (open) days.
    const hours = closedOnDayOf(NOW)
    const first = getFirstAvailableSlot(baseConfig, NOW, hours)
    expect(first).toEqual({ dateValue: '2026-06-16', timeValue: '09:00' })
  })
})

describe('isValidScheduledTime', () => {
  test('rejects times before the lead-time floor', () => {
    const tooSoon = new Date(2026, 5, 15, 10, 15, 0) // +15m, lead is 30m
    expect(isValidScheduledTime(baseConfig, tooSoon, NOW)).toBe(false)
  })

  test('accepts a time within lead time and horizon', () => {
    const ok = combineDateAndTime('2026-06-16', '12:00')
    expect(isValidScheduledTime(baseConfig, ok, NOW)).toBe(true)
  })

  test('rejects times beyond the horizon', () => {
    const tooFar = new Date(2026, 5, 30, 12, 0, 0) // 15 days out, max 7
    expect(isValidScheduledTime(baseConfig, tooFar, NOW)).toBe(false)
  })

  test('rejects a time outside the operating window', () => {
    const when = combineDateAndTime('2026-06-16', '22:30') // after 21:00 close
    expect(isValidScheduledTime(baseConfig, when, NOW, openHours('09:00', '21:00'))).toBe(false)
  })

  test('rejects a time on a closed day', () => {
    const when = combineDateAndTime('2026-06-16', '12:00')
    const closedDate = new Date(2026, 5, 16, 0, 0, 0, 0)
    expect(isValidScheduledTime(baseConfig, when, NOW, closedOnDayOf(closedDate))).toBe(false)
  })
})

describe('deterministic formatting', () => {
  test('formatLeadTime', () => {
    expect(formatLeadTime(30)).toBe('30 minutes')
    expect(formatLeadTime(1)).toBe('1 minute')
    expect(formatLeadTime(60)).toBe('1 hour')
    expect(formatLeadTime(90)).toBe('1.5 hours')
    expect(formatLeadTime(120)).toBe('2 hours')
  })

  test('minutesToTimeValue', () => {
    expect(minutesToTimeValue(630)).toBe('10:30')
    expect(minutesToTimeValue(0)).toBe('00:00')
  })

  test('formatScheduledFor is a stable, locale-independent label', () => {
    const label = formatScheduledFor(new Date(2026, 5, 17, 17, 0, 0))
    expect(label).toBe('Wed, Jun 17 · 5:00 PM')
  })
})
