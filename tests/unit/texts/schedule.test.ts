/**
 * Campaign timing on the server: the app's due-date maths (ported, parity
 * checked), plus the server rules — a one-off goes once, an occurrence more
 * than a day late is MISSED (never caught up), repeats stop after `endsOn`,
 * and a resume never catches up on what was skipped while paused.
 */

import {
  MISSED_AFTER_MS, campaignExpiryMs, computeNextDueAt, manilaInstant, nextServerDueAt, shiftOutOfQuietHours,
  type PhoneSchedule, type ServerRun,
} from '@/lib/texts/schedule'
import { computeNextDueAt as appComputeNextDueAt, shiftOutOfQuietHours as appShift } from '../../../webnegosyo-app/lib/sms/schedule'
import type { CampaignSchedule } from '@/lib/texts/types'

const QUIET = { start: '21:00', end: '08:00' }
const at = (iso: string) => new Date(iso)

function schedule(overrides: Partial<CampaignSchedule>): CampaignSchedule {
  return { kind: 'one_off', time: '10:00', date: '2026-10-16', intervalDays: null, weekdays: [], endsOn: null, ...overrides }
}

function input(overrides: Partial<Parameters<typeof nextServerDueAt>[0]> = {}) {
  return {
    schedule: schedule({}),
    scheduledFrom: at('2026-10-14T00:00:00Z'),
    createdAt: at('2026-10-13T00:00:00Z'),
    runs: [] as ServerRun[],
    quietHours: QUIET,
    now: at('2026-10-14T02:00:00Z'), // Wed 10:00 Manila
    ...overrides,
  }
}

describe('parity with the merchant app', () => {
  const schedules: PhoneSchedule[] = [
    { scheduleKind: 'one_off', scheduleTime: '10:00', scheduleDate: '2026-10-20', scheduleIntervalDays: null, scheduleWeekdays: [], quietHoursStart: '21:00', quietHoursEnd: '08:00' },
    { scheduleKind: 'every_n_days', scheduleTime: '22:30', scheduleDate: null, scheduleIntervalDays: 3, scheduleWeekdays: [], quietHoursStart: '21:00', quietHoursEnd: '08:00' },
    { scheduleKind: 'weekly', scheduleTime: '17:00', scheduleDate: null, scheduleIntervalDays: null, scheduleWeekdays: [5, 6], quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    { scheduleKind: 'weekly', scheduleTime: '07:00', scheduleDate: null, scheduleIntervalDays: null, scheduleWeekdays: [], quietHoursStart: '21:00', quietHoursEnd: '08:00' },
  ]
  const contexts = [
    { after: at('2026-10-14T02:00:00Z') },
    { after: at('2026-10-14T02:00:00Z'), lastRunAt: at('2026-10-12T02:00:00Z'), createdAt: at('2026-10-01T00:00:00Z') },
    { after: at('2026-10-18T15:59:00Z'), createdAt: at('2026-10-01T00:00:00Z') },
  ]
  test.each(schedules.flatMap((s) => contexts.map((c) => [s, c] as const)))('same next due for %j %j', (s, c) => {
    expect(computeNextDueAt(s, c)?.toISOString() ?? null).toBe(appComputeNextDueAt(s, c)?.toISOString() ?? null)
  })

  test.each(['2026-10-14T13:30:00Z', '2026-10-14T23:59:00Z', '2026-10-14T05:00:00Z'])('same quiet-hours shift at %s', (iso) => {
    expect(shiftOutOfQuietHours(at(iso), '21:00', '08:00').toISOString()).toBe(appShift(at(iso), '21:00', '08:00').toISOString())
  })
})

describe('nextServerDueAt — one-off', () => {
  test('is upcoming before its time', () => {
    expect(nextServerDueAt(input())).toEqual({ dueAt: at('2026-10-16T02:00:00Z'), state: 'upcoming' })
  })

  test('is due once its time passed, within a day', () => {
    const result = nextServerDueAt(input({ now: at('2026-10-16T05:00:00Z') }))
    expect(result.state).toBe('due')
  })

  test('is missed when more than 24 hours late — never caught up', () => {
    const late = new Date(at('2026-10-16T02:00:00Z').getTime() + MISSED_AFTER_MS + 60_000)
    expect(nextServerDueAt(input({ now: late })).state).toBe('missed')
  })

  test('is finished once any run exists', () => {
    const runs: ServerRun[] = [{ dueAt: at('2026-10-15T00:00:00Z'), status: 'cancelled' }]
    expect(nextServerDueAt(input({ runs }))).toEqual({ dueAt: null, state: 'finished' })
  })

  test('a time inside quiet hours waits for the store window to end', () => {
    const result = nextServerDueAt(input({ schedule: schedule({ time: '23:00' }) }))
    expect(result.dueAt?.toISOString()).toBe('2026-10-17T00:00:00.000Z') // 08:00 Manila next day
  })
})

describe('nextServerDueAt — repeats', () => {
  const weekly = schedule({ kind: 'weekly', date: null, weekdays: [5], endsOn: '2026-12-31' }) // Fridays 10:00

  test('first send is the next matching day after scheduling', () => {
    expect(nextServerDueAt(input({ schedule: weekly })).dueAt?.toISOString()).toBe('2026-10-16T02:00:00.000Z')
  })

  test('anchors on the latest run, whatever its status', () => {
    const runs: ServerRun[] = [{ dueAt: at('2026-10-16T02:00:00Z'), status: 'cancelled' }]
    const result = nextServerDueAt(input({ schedule: weekly, runs, now: at('2026-10-16T03:00:00Z') }))
    expect(result).toEqual({ dueAt: at('2026-10-23T02:00:00Z'), state: 'upcoming' })
  })

  test('a resume does not catch up on Fridays skipped while paused', () => {
    const runs: ServerRun[] = [{ dueAt: at('2026-10-16T02:00:00Z'), status: 'completed' }]
    const result = nextServerDueAt(input({ schedule: weekly, runs, scheduledFrom: at('2026-11-04T00:00:00Z'), now: at('2026-11-04T00:00:00Z') }))
    expect(result.dueAt?.toISOString()).toBe('2026-11-06T02:00:00.000Z')
  })

  test('every N days waits N days after the last run', () => {
    const everyThree = schedule({ kind: 'every_n_days', date: null, intervalDays: 3, endsOn: '2026-12-31' })
    const runs: ServerRun[] = [{ dueAt: at('2026-10-14T02:00:00Z'), status: 'completed' }]
    expect(nextServerDueAt(input({ schedule: everyThree, runs })).dueAt?.toISOString()).toBe('2026-10-17T02:00:00.000Z')
  })

  test('stops after the end date', () => {
    const ending = { ...weekly, endsOn: '2026-10-15' }
    expect(nextServerDueAt(input({ schedule: ending }))).toEqual({ dueAt: null, state: 'finished' })
  })

  test('a repeat more than a day late is missed', () => {
    const result = nextServerDueAt(input({ schedule: weekly, now: at('2026-10-17T03:00:00Z') }))
    expect(result.state).toBe('missed')
  })
})

describe('campaignExpiryMs', () => {
  const HOUR = 3_600_000
  test('72 hours, shortened for campaigns that come back sooner', () => {
    expect(campaignExpiryMs(schedule({}))).toBe(72 * HOUR)
    expect(campaignExpiryMs(schedule({ kind: 'every_n_days', intervalDays: 1 }))).toBe(24 * HOUR)
    expect(campaignExpiryMs(schedule({ kind: 'every_n_days', intervalDays: 7 }))).toBe(72 * HOUR)
    expect(campaignExpiryMs(schedule({ kind: 'weekly', weekdays: [1, 2] }))).toBe(24 * HOUR)
    expect(campaignExpiryMs(schedule({ kind: 'weekly', weekdays: [7, 1] }))).toBe(24 * HOUR)
    expect(campaignExpiryMs(schedule({ kind: 'weekly', weekdays: [3] }))).toBe(72 * HOUR)
  })
})

test('manilaInstant reads a Manila wall clock', () => {
  expect(manilaInstant('2026-10-16', '10:00')?.toISOString()).toBe('2026-10-16T02:00:00.000Z')
  expect(manilaInstant('garbage', '10:00')).toBeNull()
})
