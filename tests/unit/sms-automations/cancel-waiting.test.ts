/** @jest-environment node */
/**
 * "Cancel all waiting automatic texts" (app Activity, web Activity) withdraws
 * automation texts only. A campaign's texts are paused from the campaign — the
 * web dialog says so — and cancelling them here would silently empty a
 * running campaign the owner never touched.
 */

import { createFakeDb } from '../texts/fake-db'

jest.mock('server-only', () => ({}))

const T = 't1'

function outbox(id: string, overrides: Record<string, unknown> = {}) {
  return { id, tenant_id: T, automation_id: 'a1', source: 'auto', recipe: 'win_back', status: 'queued', ...overrides }
}

test('cancelling every waiting text leaves campaign texts alone', async () => {
  const { cancelWaiting } = await import('@/lib/sms-automations/api/writes')
  const db = createFakeDb({
    sms_outbox: [
      outbox('o1'),
      outbox('o2', { source: 'run_now' }),
      outbox('o3', { automation_id: null, source: 'campaign', recipe: 'campaign', campaign_run_id: 'r1' }),
      outbox('o4', { tenant_id: 'other' }),
    ],
  })

  const cancelled = await cancelWaiting(db.client as never, T)

  expect(cancelled).toBe(2)
  const statusOf = (id: string) => db.tables.sms_outbox.find((row) => row.id === id)?.status
  expect([statusOf('o1'), statusOf('o2'), statusOf('o3'), statusOf('o4')]).toEqual(['cancelled', 'cancelled', 'queued', 'queued'])
})

test('cancelling one automation\'s waiting texts touches only that automation', async () => {
  const { cancelWaiting } = await import('@/lib/sms-automations/api/writes')
  const db = createFakeDb({ sms_outbox: [outbox('o1'), outbox('o2', { automation_id: 'a2' })] })

  expect(await cancelWaiting(db.client as never, T, 'a1')).toBe(1)
  expect(db.tables.sms_outbox.map((row) => row.status)).toEqual(['cancelled', 'queued'])
})
