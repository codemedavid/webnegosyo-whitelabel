/** @jest-environment node */
/**
 * The 5-minute tick for server campaigns: start what is due when the store
 * has a phone, wait (up to a day) when it has none, pause anything more than
 * a day late instead of sending an old promo, and close runs whose texts are
 * all settled.
 */

import { TEXTS_UNIQUE, createFakeDb, type FakeDbOptions } from './fake-db'

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

function seed(tables: Record<string, Record<string, unknown>[]>, options: Omit<FakeDbOptions, 'unique'> = {}) {
  return createFakeDb({
    tenants: [{ id: T, name: 'Kainan', order_backend: 'platform' }],
    customers: [{ id: 'g1', tenant_id: T, name: 'Ana', phone_e164: '+639170000001', sms_consent: true, sms_opt_out: false, order_count: 2, total_spent: 1, last_order_at: '2026-10-01T00:00:00Z', top_items: [], channels_used: [] }],
    sms_outbox: [], sms_sends: [], sms_suppressions: [], sms_campaign_runs: [], loyalty_sms_devices: [], loyalty_sms_device_heartbeats: [],
    ...tables,
  }, { unique: TEXTS_UNIQUE, ...options })
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

describe('review items 4, 5 and 11 (tick side)', () => {
  test('reads every scheduled campaign, not just the first 200', async () => {
    const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
    const late = Array.from({ length: 250 }, (_, i) => campaign(`c${String(i).padStart(3, '0')}`, { schedule_date: '2026-10-13', schedule_time: '00:30' }))
    const db = seed({ sms_campaigns: late })
    // 2026-10-13 00:30 Manila is more than a day before NOW: every one is missed.
    expect((await runCampaignsForStore(db.client, T, NOW)).missed).toBe(250)
  })

  test('finished campaigns are filtered out in SQL; their settled runs still close', async () => {
    const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
    const db = seed({
      sms_campaigns: [
        campaign('old', { schedule_date: '2026-10-08' }),
        campaign('ended', { schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [3], ends_on: '2026-10-13' }),
      ],
      sms_campaign_runs: [{ id: 'r-old', tenant_id: T, campaign_id: 'old', due_at: '2026-10-08T01:00:00Z', delivery: 'server', status: 'running', created_at: '2026-10-08T01:00:00Z' }],
      sms_outbox: [{ id: 'o1', tenant_id: T, campaign_run_id: 'r-old', status: 'expired' }],
    })
    expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ missed: 0, closed: 1 })
    expect(db.tables.sms_campaigns.map((c) => c.status)).toEqual(['scheduled', 'scheduled'])
    const scan = db.calls.filter((c) => c.table === 'sms_campaigns' && c.op === 'or').map((c) => String(c.args[0]))
    expect(scan).toEqual(expect.arrayContaining(['schedule_kind.neq.one_off,schedule_date.gte.2026-10-12', 'ends_on.is.null,ends_on.gte.2026-10-14']))
  })

  test('one failing campaign does not stop the others', async () => {
    const { runCampaignsForStore } = await import('@/lib/texts/server/campaign-tick')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const db = seed({ sms_campaigns: [campaign('bad'), campaign('good')], ...PHONE }, {
      beforeWrite: ({ table, rows }) => { if (table === 'sms_campaign_runs' && rows[0]?.campaign_id === 'bad') throw new Error('boom') },
    })
    expect(await runCampaignsForStore(db.client, T, NOW)).toMatchObject({ started: 1, failed: 1 })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  test('a campaign paused outside the web (old app) gets its waiting texts withdrawn; a resumed one gets them back', async () => {
    const { runCampaignsForStore, serverCampaignStores } = await import('@/lib/texts/server/campaign-tick')
    const run = (id: string, campaignId: string) => ({ id, tenant_id: T, campaign_id: campaignId, due_at: '2026-10-14T01:00:00.000Z', delivery: 'server', status: 'running', created_at: '2026-10-14T01:00:00Z' })
    const db = seed({
      sms_campaigns: [campaign('paused', { status: 'paused' }), campaign('resumed')],
      sms_campaign_runs: [run('r-p', 'paused'), run('r-r', 'resumed')],
      sms_outbox: [
        { id: 'o1', tenant_id: T, campaign_run_id: 'r-p', status: 'queued', skip_reason: null, expires_at: '2026-10-17T00:00:00Z' },
        { id: 'o2', tenant_id: T, campaign_run_id: 'r-r', status: 'cancelled', skip_reason: 'paused', expires_at: '2026-10-17T00:00:00Z' },
      ],
    })
    expect([...(await serverCampaignStores(db.client))]).toEqual([T])
    await runCampaignsForStore(db.client, T, NOW)
    expect(db.tables.sms_outbox.map((o) => [o.id, o.status, o.skip_reason])).toEqual([['o1', 'cancelled', 'paused'], ['o2', 'queued', null]])
    expect(db.tables.sms_campaign_runs.find((r) => r.id === 'r-p')?.status).toBe('running') // never closed while paused
  })
})
