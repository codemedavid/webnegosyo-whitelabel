import {
  parseHHMM,
  minutesToHHMM,
  normalizeOperatingHours,
  getDayWindow,
  isOpenOn,
  buildDefaultOperatingHours,
  DEFAULT_OPEN_MINUTES,
  DEFAULT_CLOSE_MINUTES,
  type OperatingHours,
} from '@/lib/operating-hours'

/** Build an OperatingHours config where `date`'s weekday carries the given hours. */
function hoursForDay(date: Date, day: { closed?: boolean; open?: string; close?: string }): OperatingHours {
  return {
    [String(date.getDay())]: {
      closed: day.closed ?? false,
      open: day.open ?? '09:00',
      close: day.close ?? '21:00',
    },
  }
}

describe('parseHHMM', () => {
  test('parses valid 24h times to minutes from midnight', () => {
    expect(parseHHMM('09:00')).toBe(540)
    expect(parseHHMM('9:00')).toBe(540)
    expect(parseHHMM('00:00')).toBe(0)
    expect(parseHHMM('23:59')).toBe(1439)
  })

  test('returns null for malformed or out-of-range input', () => {
    expect(parseHHMM('24:00')).toBeNull()
    expect(parseHHMM('12:60')).toBeNull()
    expect(parseHHMM('abc')).toBeNull()
    expect(parseHHMM('')).toBeNull()
    expect(parseHHMM(null)).toBeNull()
    expect(parseHHMM(undefined)).toBeNull()
  })
})

describe('minutesToHHMM', () => {
  test('formats minutes from midnight as zero-padded 24h', () => {
    expect(minutesToHHMM(540)).toBe('09:00')
    expect(minutesToHHMM(0)).toBe('00:00')
    expect(minutesToHHMM(1439)).toBe('23:59')
  })

  test('clamps out-of-range values', () => {
    expect(minutesToHHMM(-30)).toBe('00:00')
    expect(minutesToHHMM(99999)).toBe('23:59')
  })
})

describe('normalizeOperatingHours', () => {
  test('returns null for non-object / empty input', () => {
    expect(normalizeOperatingHours(null)).toBeNull()
    expect(normalizeOperatingHours(undefined)).toBeNull()
    expect(normalizeOperatingHours('nope')).toBeNull()
    expect(normalizeOperatingHours({})).toBeNull()
  })

  test('keeps well-formed days and preserves closed flag', () => {
    const result = normalizeOperatingHours({
      '1': { closed: false, open: '11:00', close: '21:00' },
      '0': { closed: true, open: '00:00', close: '00:00' },
    })
    expect(result).toEqual({
      '1': { closed: false, open: '11:00', close: '21:00' },
      '0': { closed: true, open: '00:00', close: '00:00' },
    })
  })

  test('falls back to defaults for malformed times', () => {
    const result = normalizeOperatingHours({ '2': { closed: false, open: 'bad', close: '99:99' } })
    expect(result).toEqual({
      '2': { closed: false, open: minutesToHHMM(DEFAULT_OPEN_MINUTES), close: minutesToHHMM(DEFAULT_CLOSE_MINUTES) },
    })
  })

  test('ignores out-of-range weekday keys and non-object days', () => {
    const result = normalizeOperatingHours({ '9': { open: '10:00' }, '3': 'nope' })
    expect(result).toBeNull()
  })
})

describe('getDayWindow', () => {
  const date = new Date(2026, 5, 15, 12, 0, 0) // arbitrary fixed local date

  test('no hours configured → default open window', () => {
    expect(getDayWindow(null, date)).toEqual({
      closed: false,
      openMinutes: DEFAULT_OPEN_MINUTES,
      closeMinutes: DEFAULT_CLOSE_MINUTES,
    })
  })

  test('explicitly closed day', () => {
    const window = getDayWindow(hoursForDay(date, { closed: true }), date)
    expect(window.closed).toBe(true)
  })

  test('valid window uses configured open/close', () => {
    const window = getDayWindow(hoursForDay(date, { open: '11:00', close: '21:00' }), date)
    expect(window).toEqual({ closed: false, openMinutes: 660, closeMinutes: 1260 })
  })

  test('weekday missing from config → default window (never silently closed)', () => {
    // Provide hours only for a different weekday than `date`.
    const otherDay = String((date.getDay() + 1) % 7)
    const window = getDayWindow({ [otherDay]: { closed: true, open: '00:00', close: '00:00' } }, date)
    expect(window).toEqual({
      closed: false,
      openMinutes: DEFAULT_OPEN_MINUTES,
      closeMinutes: DEFAULT_CLOSE_MINUTES,
    })
  })

  test('close <= open → falls back to default window', () => {
    const window = getDayWindow(hoursForDay(date, { open: '21:00', close: '09:00' }), date)
    expect(window).toEqual({
      closed: false,
      openMinutes: DEFAULT_OPEN_MINUTES,
      closeMinutes: DEFAULT_CLOSE_MINUTES,
    })
  })
})

describe('isOpenOn', () => {
  const date = new Date(2026, 5, 15, 12, 0, 0)

  test('open when no hours configured', () => {
    expect(isOpenOn(null, date)).toBe(true)
  })

  test('false on an explicitly closed day', () => {
    expect(isOpenOn(hoursForDay(date, { closed: true }), date)).toBe(false)
  })

  test('true on an open day', () => {
    expect(isOpenOn(hoursForDay(date, { open: '08:00', close: '20:00' }), date)).toBe(true)
  })
})

describe('buildDefaultOperatingHours', () => {
  test('produces all seven days open with the given window', () => {
    const week = buildDefaultOperatingHours('10:00', '22:00')
    expect(Object.keys(week).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    for (const key of Object.keys(week)) {
      expect(week[key]).toEqual({ closed: false, open: '10:00', close: '22:00' })
    }
  })

  test('falls back to sane defaults for invalid input', () => {
    const week = buildDefaultOperatingHours('bad', 'worse')
    expect(week['1']).toEqual({ closed: false, open: '09:00', close: '21:00' })
  })
})
