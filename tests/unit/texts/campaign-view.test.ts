/**
 * campaign-view: the list's chip, "When" line, audience words and edit lock,
 * all derived from the stored row + its runs. Never stored, never guessed.
 */

import {
  campaignFromRow, deriveDisplayState, formatManilaTime, isCampaignEditable, messagePreviewOf, toCampaignListItem, whenLabelOf,
  type CampaignRecord, type DisplayInput,
} from '@/lib/texts/campaign-view'
import type { CampaignSchedule } from '@/lib/texts/types'

const NOW = new Date('2026-10-14T02:00:00Z') // Wed 10:00 Manila
const ONE_OFF: CampaignSchedule = { kind: 'one_off', time: '10:00', date: '2026-10-16', intervalDays: null, weekdays: [], endsOn: null }
const WEEKLY: CampaignSchedule = { kind: 'weekly', time: '10:00', date: null, intervalDays: null, weekdays: [5], endsOn: '2026-12-31' }

function display(overrides: Partial<DisplayInput> = {}): DisplayInput {
  return {
    status: 'scheduled', delivery: 'server', schedule: ONE_OFF, hasAnyRun: false, hasOpenRun: false,
    isPhoneReady: true, due: { dueAt: new Date('2026-10-16T02:00:00Z'), state: 'upcoming' }, ...overrides,
  }
}

describe('deriveDisplayState', () => {
  test.each([
    ['draft', display({ status: 'draft' })],
    ['archived', display({ status: 'archived', hasOpenRun: true })],
    ['app_managed', display({ status: 'active', delivery: 'phone' })],
    ['paused', display({ status: 'paused', delivery: 'phone' })],
    ['paused', display({ status: 'paused', hasOpenRun: true })],
    ['sending', display({ hasOpenRun: true })],
    ['waiting_for_phone', display({ hasOpenRun: true, isPhoneReady: false })],
    ['scheduled', display()],
    ['sent', display({ hasAnyRun: true, due: { dueAt: null, state: 'finished' } })],
    ['waiting_for_phone', display({ isPhoneReady: false, due: { dueAt: NOW, state: 'due' } })],
    ['scheduled', display({ due: { dueAt: NOW, state: 'due' } })],
    ['repeating', display({ schedule: WEEKLY })],
    ['finished', display({ schedule: WEEKLY, hasAnyRun: true, due: { dueAt: null, state: 'finished' } })],
    ['sending', display({ schedule: WEEKLY, hasOpenRun: true })],
  ] as const)('%s', (expected, input) => {
    expect(deriveDisplayState(input)).toBe(expected)
  })
})

describe('whenLabelOf (Manila time)', () => {
  test('one-off before, while and after sending', () => {
    expect(whenLabelOf({ state: 'scheduled', schedule: ONE_OFF, nextSendAt: '2026-10-16T02:00:00Z', lastSentAt: null, now: NOW })).toBe('Starts Fri, 10:00 AM')
    expect(whenLabelOf({ state: 'scheduled', schedule: ONE_OFF, nextSendAt: '2026-10-30T07:30:00Z', lastSentAt: null, now: NOW })).toBe('Starts Oct 30, 3:30 PM')
    expect(whenLabelOf({ state: 'sent', schedule: ONE_OFF, nextSendAt: null, lastSentAt: '2026-10-12T02:00:00Z', now: NOW })).toBe('Sent Oct 12, 10:00 AM')
    expect(whenLabelOf({ state: 'draft', schedule: ONE_OFF, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('—')
  })

  test('repeats say their rhythm', () => {
    expect(whenLabelOf({ state: 'repeating', schedule: WEEKLY, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('Every Friday, 10:00 AM')
    expect(whenLabelOf({ state: 'repeating', schedule: { ...WEEKLY, weekdays: [1, 3, 5] }, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('Every Mon, Wed & Fri, 10:00 AM')
    expect(whenLabelOf({ state: 'repeating', schedule: { ...WEEKLY, kind: 'every_n_days', intervalDays: 1 }, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('Every day, 10:00 AM')
    expect(whenLabelOf({ state: 'repeating', schedule: { ...WEEKLY, kind: 'every_n_days', intervalDays: 3, time: '17:00' }, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('Every 3 days, 5:00 PM')
    expect(whenLabelOf({ state: 'finished', schedule: WEEKLY, nextSendAt: null, lastSentAt: null, now: NOW })).toBe('Ended Dec 31')
  })

  test('formats the clock the Philippine way', () => {
    expect(formatManilaTime('00:05')).toBe('12:05 AM')
    expect(formatManilaTime('12:00')).toBe('12:00 PM')
  })
})

describe('edit lock and preview', () => {
  test('locked once the first text of a one-off went out, or while a run is open', () => {
    expect(isCampaignEditable({ status: 'draft', schedule: ONE_OFF, hasAnyRun: false, hasOpenRun: false })).toBe(true)
    expect(isCampaignEditable({ status: 'scheduled', schedule: ONE_OFF, hasAnyRun: true, hasOpenRun: false })).toBe(false)
    expect(isCampaignEditable({ status: 'scheduled', schedule: WEEKLY, hasAnyRun: true, hasOpenRun: false })).toBe(true)
    expect(isCampaignEditable({ status: 'scheduled', schedule: WEEKLY, hasAnyRun: true, hasOpenRun: true })).toBe(false)
    expect(isCampaignEditable({ status: 'archived', schedule: WEEKLY, hasAnyRun: false, hasOpenRun: false })).toBe(false)
  })

  test('the preview is the first line', () => {
    expect(messagePreviewOf('  Hi {{firstName}}!\nSee you soon')).toBe('Hi {{firstName}}!')
  })
})

describe('campaignFromRow + toCampaignListItem', () => {
  const row = {
    id: 'c1', name: 'Win back', message_template: 'Hi {{firstName}}', audience: { lastOrderOlderThanDays: 21, junk: 'x' },
    schedule_kind: 'weekly', schedule_time: '10:00', schedule_date: null, schedule_interval_days: null, schedule_weekdays: [5],
    ends_on: '2026-12-31', status: 'scheduled', delivery: 'server', pause_reason: null, scheduled_from: '2026-10-14T00:00:00Z',
    created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z',
  }

  test('tolerates junk and unknown values', () => {
    const parsed = campaignFromRow({ ...row, status: 'weird', delivery: null, schedule_weekdays: null }) as CampaignRecord
    expect(parsed.status).toBe('archived')
    expect(parsed.delivery).toBe('phone')
    expect(parsed.audience).toEqual({ lastOrderOlderThanDays: 21 })
  })

  test('builds the list item the page renders', () => {
    const item = toCampaignListItem(campaignFromRow(row) as CampaignRecord, {
      runs: [], progress: null, results: null, isPhoneReady: true, quietHours: { start: '21:00', end: '08:00' }, now: NOW,
    })
    expect(item).toMatchObject({
      id: 'c1', displayState: 'repeating', audiencePreset: 'lapsed', audienceLabel: "Haven't been back",
      whenLabel: 'Every Friday, 10:00 AM', nextSendAt: '2026-10-16T02:00:00.000Z', isEditable: true, messagePreview: 'Hi {{firstName}}',
      schedule: { kind: 'weekly', weekdays: [5], endsOn: '2026-12-31' }, pauseReason: null,
    })
  })
})
