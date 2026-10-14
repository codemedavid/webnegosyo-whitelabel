/**
 * campaignDraftInputSchema: what the composer may save. Repeats need an end
 * date within six months; each schedule kind carries the field that steers it
 * (mirrors sms_campaigns_schedule_fields_ck); messages use known words only.
 */

import { campaignDraftInputSchema, checkScheduleTiming, maxEndsOn } from '@/lib/texts/campaign-schema'
import type { CampaignDraftInput } from '@/lib/texts/types'

const NOW = new Date('2026-10-14T02:00:00Z')

function draft(overrides: Partial<CampaignDraftInput> = {}): CampaignDraftInput {
  return {
    name: 'Weekend reminder',
    messageTemplate: 'Hi {{firstName}}, see you this weekend!',
    audience: { minOrderCount: 3 },
    schedule: { kind: 'one_off', time: '10:00', date: '2026-10-16', intervalDays: null, weekdays: [], endsOn: null },
    ...overrides,
  }
}

const weekly = { kind: 'weekly' as const, time: '10:00', date: null, intervalDays: null, weekdays: [5], endsOn: '2026-12-01' }

beforeAll(() => { jest.useFakeTimers().setSystemTime(NOW) })
afterAll(() => { jest.useRealTimers() })

function errorsOf(input: unknown): string[] {
  const result = campaignDraftInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

test('accepts a valid one-off and a valid repeat', () => {
  expect(errorsOf(draft())).toEqual([])
  expect(errorsOf(draft({ schedule: weekly }))).toEqual([])
})

test('trims the name and asks for one', () => {
  expect(campaignDraftInputSchema.parse(draft({ name: '  Promo  ' })).name).toBe('Promo')
  expect(errorsOf(draft({ name: '   ' }))).toContain('Give it a name only you will see.')
  expect(errorsOf(draft({ name: 'x'.repeat(61) }))).toContain('Keep the name under 60 characters.')
})

test('refuses unknown words and empty messages', () => {
  expect(errorsOf(draft({ messageTemplate: 'Get {{discount}}' }))).toContain("We don't know {{discount}}. Use the chips above.")
  expect(errorsOf(draft({ messageTemplate: '' })).length).toBeGreaterThan(0)
})

test('each schedule kind needs its own field', () => {
  expect(errorsOf(draft({ schedule: { ...weekly, kind: 'one_off' } }))).toContain('Pick a date.')
  expect(errorsOf(draft({ schedule: { ...weekly, kind: 'every_n_days' } }))).toContain('Pick how many days apart.')
  expect(errorsOf(draft({ schedule: { ...weekly, weekdays: [] } }))).toContain('Pick at least one day.')
  expect(errorsOf(draft({ schedule: { ...weekly, time: '25:00' } }))).toContain('Pick a time.')
})

test('repeats need an end date within six months', () => {
  expect(errorsOf(draft({ schedule: { ...weekly, endsOn: null } }))).toContain('Pick when it stops.')
  expect(maxEndsOn(NOW)).toBe('2027-04-14')
  expect(errorsOf(draft({ schedule: { ...weekly, endsOn: '2027-04-15' } }))).toContain('End it within 6 months.')
  expect(errorsOf(draft({ schedule: { ...weekly, endsOn: '2027-04-14' } }))).toEqual([])
})

test('unknown keys and junk audiences are refused', () => {
  expect(errorsOf({ ...draft(), extra: 1 }).length).toBeGreaterThan(0)
  expect(errorsOf(draft({ audience: { minOrderCount: -1 } })).length).toBeGreaterThan(0)
})

describe('checkScheduleTiming', () => {
  test('a one-off must be from now on (a few minutes of grace)', () => {
    expect(checkScheduleTiming(draft().schedule, NOW)).toBeNull()
    expect(checkScheduleTiming({ ...draft().schedule, date: '2026-10-14', time: '09:57' }, NOW)).toBeNull()
    expect(checkScheduleTiming({ ...draft().schedule, date: '2026-10-13' }, NOW)).toBe('Pick a time from now on.')
  })

  test('a repeat must not have ended already', () => {
    expect(checkScheduleTiming({ ...weekly, endsOn: '2026-10-13' }, NOW)).toBe('Pick an end date from today on.')
    expect(checkScheduleTiming({ ...weekly, endsOn: '2026-10-14' }, NOW)).toBeNull()
  })
})

describe('checkScheduleTiming with the store quiet hours (review item 2)', () => {
  const quiet = { start: '21:00', end: '07:00' }

  test('refuses a send time inside quiet hours, in the owner\'s words', () => {
    expect(checkScheduleTiming({ ...draft().schedule, time: '23:00' }, NOW, quiet))
      .toBe("That's inside quiet hours (9 PM–7 AM). Pick a time after 7 AM.")
    expect(checkScheduleTiming({ ...weekly, time: '06:30' }, NOW, { start: '21:30', end: '07:30' }))
      .toBe("That's inside quiet hours (9:30 PM–7:30 AM). Pick a time after 7:30 AM.")
  })

  test('a time at the window\'s end is fine', () => {
    expect(checkScheduleTiming({ ...draft().schedule, time: '07:00' }, NOW, quiet)).toBeNull()
  })
})
