/** @jest-environment node */
/**
 * The 5-minute tick for server campaigns: start what is due when the store
 * has a phone, wait (up to a day) when it has none, pause anything more than
 * a day late instead of sending an old promo, and close runs whose texts are
 * all settled.
 */

import { TEXTS_UNIQUE, createFakeDb } from './fake-db'

jest.mock('server-only', () => ({}))

const T = 't1'
const NOW = new Date('2026-10-14T02:00:00Z') // Wed 10:00 Manila

function campaign(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, tenant_id: T, name: id, message_template: 'Hi {{firstName}}', audience: {}, schedule_kind: 'one_off', schedule_time: '09:00',
    schedule_date: '2026-10-14', schedule_interval_days: null, schedule_weekdays: [], ends_on: null, status: 'scheduled',
    delivery: 'server', pause_reason: null, scheduled_from: '2026-10-13T00:00:00Z', created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z',
    ...overrides,
  }
}

function seed(tables: Record<string, Record<string, unknown>[]>) {
  return createFakeDb({
    tenants: [{ id: T, name: 'Kainan', order_backend: 'platform' }],
    customers: [{ id: 'g1', tenant_id: T, name: 'Ana', phone_e164: '+639170000001', sms_consent: true, sms_opt_out: false, order_count: 2, total_spent: 1, last_order_at: '2026-10-01T00:00:00Z', top_items: [], channels_used: [] }],
    sms_outbox: [], sms_sends: [], sms_suppressions: [], sms_campaign_runs: [], loyalty_sms_devices: [], loyalty_sms_device_heartbeats: [],
    ...tables,
  }, { unique: TEXTS_UNIQUE })
}

const PHONE = { loyalty_sms_devices: [{ device_id: 'd1', tenant_id: T, enabled: true }] }

test('starts a due occurrence when the store has a phone', async () => {
  const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
  const db = seed({ sms_campaigns: [campaign('due')], ...PHONE })

  const result = await runCampaignsForStore(db.client, T, NOW)

  expect(result).toMatchObject({ started: 1, queued: 1, missed: 0 })
  expect(db.tables.sms_campaign_runs).toEqual([expect.objectContaining({ campaign_id: 'due', trigger: 'schedule', due_at: '2026-10-14T01:00:00.000Z' })])
})

test('waits for a phone instead of queueing into nowhere', async () => {
  const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
  const db = seed({ sms_campaigns: [campaign('due')] })

  expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ started: 0, missed: 0 })
  expect(db.tables.sms_campaign_runs).toHaveLength(0)
  expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'scheduled' })
})

test('pauses itself when more than a day late — never sends an old promo', async () => {
  const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
  const db = seed({ sms_campaigns: [campaign('late', { schedule_date: '2026-10-12' })], ...PHONE })

  expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ started: 0, missed: 1 })
  expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'paused', pause_reason: 'missed_no_phone' })
  expect(db.tables.sms_campaign_runs).toHaveLength(0)
})

test('closes a running run once no text is waiting or in a phone', async () => {
  const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
  const run = (id: string, campaignId: string) => ({ id, tenant_id: T, campaign_id: campaignId, due_at: '2026-10-14T01:00:00.000Z', delivery: 'server', status: 'running', created_at: '2026-10-14T01:00:00Z' })
  const db = seed({
    sms_campaigns: [campaign('done'), campaign('busy')],
    sms_campaign_runs: [run('r-done', 'done'), run('r-busy', 'busy')],
    sms_outbox: [
      { id: 'o1', tenant_id: T, campaign_run_id: 'r-done', status: 'sent' },
      { id: 'o2', tenant_id: T, campaign_run_id: 'r-busy', status: 'claimed' },
    ],
  })

  expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ closed: 1, started: 0 })
  const byId = Object.fromEntries(db.tables.sms_campaign_runs.map((r) => [r.id, r.status]))
  expect(byId).toEqual({ 'r-done': 'completed', 'r-busy': 'running' })
})

test('a repeat past its end date does nothing', async () => {
  const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
  const ended = campaign('ended', { schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [3], ends_on: '2026-10-13' })
  const db = seed({ sms_campaigns: [ended], ...PHONE })

  expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ started: 0, missed: 0 })
})

test('serverCampaignStores lists stores with a scheduled server campaign', async () => {
  const { serverCampaignStores } = await import('@/lib/texts/server/campaign-tick')
  const db = seed({ sms_campaigns: [campaign('a'), { ...campaign('b'), tenant_id: 't2' }, { ...campaign('c'), tenant_id: 't3', status: 'paused' }] })
  expect([...(await serverCampaignStores(db.client))].sort()).toEqual(['t1', 't2'])
})
