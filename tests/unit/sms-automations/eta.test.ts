/**
 * "When will these texts be out?" — the honest answer the Run now sheet shows.
 * One phone sends at most 25 texts per 30 minutes (Android's limit is ~30),
 * never during quiet hours, and never past the store's daily limit.
 */

import { estimateDeliveryFinish } from '@/lib/sms-automations/eta'

const NOON = new Date('2026-10-12T04:00:00Z') // 12:00 Manila
const rules = { quietHoursStart: '21:00', quietHoursEnd: '08:00', dailyLimit: 100 }

describe('estimateDeliveryFinish', () => {
  it('is now when nothing is waiting', () => {
    expect(estimateDeliveryFinish({ waiting: 0, sentToday: 0, now: NOON, rules })).toEqual(NOON)
  })

  it('sends 25 per half hour', () => {
    // 60 texts = 25 + 25 + 10 → the third window, which opens at 13:00.
    expect(estimateDeliveryFinish({ waiting: 60, sentToday: 0, now: NOON, rules })?.toISOString()).toBe('2026-10-12T05:00:00.000Z')
  })

  it('waits for the next day once the daily limit is reached', () => {
    // 90 already sent today: 10 more today, the other 20 at 08:00 tomorrow.
    expect(estimateDeliveryFinish({ waiting: 30, sentToday: 90, now: NOON, rules })?.toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })

  it('holds through quiet hours', () => {
    const late = new Date('2026-10-12T12:50:00Z') // 20:50 Manila
    // 25 go at 20:50; the rest wait for 08:00.
    expect(estimateDeliveryFinish({ waiting: 40, sentToday: 0, now: late, rules })?.toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })

  it('gives up (null) on a backlog that would take more than two weeks', () => {
    expect(estimateDeliveryFinish({ waiting: 5000, sentToday: 0, now: NOON, rules: { ...rules, dailyLimit: 10 } })).toBeNull()
  })
})
