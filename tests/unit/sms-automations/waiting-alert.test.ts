/** @jest-environment node */
/**
 * "Texts are waiting": one push to the owner's phones when automated texts
 * are due but the sending phone has gone quiet — never at night, never more
 * than once every 12 hours, never twice from racing ticks.
 */

import { alertWaitingTexts, waitingAlertDue } from '@/lib/sms-automations/server/waiting-alert'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOON = new Date('2026-10-14T04:00:00Z') // 12:00 Manila
const minutesAgo = (m: number) => new Date(NOON.getTime() - m * 60_000).toISOString()

describe('waitingAlertDue', () => {
  const base = { waitingDue: 5, lastSeenAt: minutesAgo(90), lastAlertAt: null, now: NOON }

  it('alerts when texts are due and the phone has been quiet for half an hour', () => {
    expect(waitingAlertDue(base)).toBe(true)
    expect(waitingAlertDue({ ...base, lastSeenAt: null })).toBe(true)
  })

  it('stays quiet when nothing is due, the phone is checking in, or it alerted recently', () => {
    expect(waitingAlertDue({ ...base, waitingDue: 0 })).toBe(false)
    expect(waitingAlertDue({ ...base, lastSeenAt: minutesAgo(5) })).toBe(false)
    expect(waitingAlertDue({ ...base, lastAlertAt: minutesAgo(6 * 60) })).toBe(false)
    expect(waitingAlertDue({ ...base, lastAlertAt: minutesAgo(13 * 60) })).toBe(true)
  })

  it('never buzzes the owner at night', () => {
    expect(waitingAlertDue({ ...base, now: new Date('2026-10-14T15:00:00Z') })).toBe(false) // 23:00 Manila
  })
})

function fakeClient({ waiting = 3, lastSeenAt = minutesAgo(90) as string | null, claimed = true, tokens = [{ token: 'ExponentPushToken[a]', user_id: 'owner' }, { token: 'ExponentPushToken[b]', user_id: 'cashier' }] } = {}) {
  const calls: string[] = []
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    Object.assign(builder, {
      select: self, eq: self, lte: self, gt: self, in: self, or: self, order: self, limit: self, insert: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }),
      update: () => { calls.push(`update:${table}`); return builder },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'sms_outbox') return Promise.resolve({ count: waiting, error: null }).then(resolve)
        if (table === 'loyalty_sms_device_heartbeats') return Promise.resolve({ data: lastSeenAt ? [{ last_seen_at: lastSeenAt }] : [], error: null }).then(resolve)
        if (table === 'sms_settings') return Promise.resolve({ data: claimed ? [{ tenant_id: 't' }] : [], error: null }).then(resolve)
        if (table === 'app_users') return Promise.resolve({ data: [{ user_id: 'owner' }], error: null }).then(resolve)
        if (table === 'platform_device_tokens') return Promise.resolve({ data: tokens, error: null }).then(resolve)
        return Promise.resolve({ data: [], error: null }).then(resolve)
      },
    })
    return builder
  }
  return { client: { from: (table: string) => { calls.push(table); return chain(table) } } as unknown as SupabaseClient, calls }
}

describe('alertWaitingTexts', () => {
  it('pushes once to the owner’s phones only', async () => {
    const { client } = fakeClient()
    const send = jest.fn().mockResolvedValue({ accepted: [], failures: [], failedChunks: 0 })
    expect(await alertWaitingTexts(client, 't', NOON, send)).toBe(true)
    const messages = send.mock.calls[0][0]
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ to: 'ExponentPushToken[a]', data: { kind: 'sms_texts_waiting' } })
    expect(messages[0].body).toMatch(/3 texts are waiting/)
  })

  it('does not push when another tick already claimed the alert', async () => {
    const { client } = fakeClient({ claimed: false })
    const send = jest.fn()
    expect(await alertWaitingTexts(client, 't', NOON, send)).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('does nothing when the phone is checking in', async () => {
    const { client, calls } = fakeClient({ lastSeenAt: minutesAgo(2) })
    const send = jest.fn()
    expect(await alertWaitingTexts(client, 't', NOON, send)).toBe(false)
    expect(calls).not.toContain('update:sms_settings')
  })
})
