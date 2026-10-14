/** @jest-environment node */
/**
 * startCampaignRun: queues one campaign row per eligible guest, is a no-op
 * the second time, and a run a crash left `pending` is re-planned by the tick
 * without texting anyone twice.
 */

import { TEXTS_UNIQUE, createFakeDb, type FakeDbOptions } from './fake-db'

jest.mock('server-only', () => ({}))

const T = 't1'
const C = 'c1'
const NOW = new Date('2026-10-14T02:00:00Z')

function seed(extra: Record<string, Record<string, unknown>[]> = {}, options: Omit<FakeDbOptions, 'unique'> = {}) {
  const customer = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, tenant_id: T, name: `Guest ${id}`, phone_e164: `+6391700000${id}`, sms_consent: true, sms_opt_out: false,
    order_count: 3, total_spent: 900, first_order_at: null, last_order_at: '2026-10-01T00:00:00Z', top_items: [], channels_used: [], ...overrides,
  })
  return createFakeDb({
    tenants: [{ id: T, name: 'Kainan', order_backend: 'platform' }],
    sms_campaigns: [{
      id: C, tenant_id: T, name: 'Promo', message_template: 'Hi {{firstName}}!', audience: {}, schedule_kind: 'one_off',
      schedule_time: '10:00', schedule_date: '2026-10-14', schedule_interval_days: null, schedule_weekdays: [], ends_on: null,
      status: 'scheduled', delivery: 'server', pause_reason: null, scheduled_from: NOW.toISOString(), created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    }],
    customers: [customer('11'), customer('12'), customer('13', { sms_consent: false }), customer('14', { phone_e164: '+639170000099' })],
    sms_suppressions: [{ id: 's1', tenant_id: T, phone_e164: '+639170000099' }],
    sms_outbox: [], sms_sends: [], sms_campaign_runs: [],
    ...extra,
  }, { unique: TEXTS_UNIQUE, ...options })
}

test('queues the eligible guests and marks the run running', async () => {
  const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
  const db = seed()

  const outcome = await startCampaignRun(db.client, T, C, { trigger: 'send_now', dueAt: NOW, now: NOW })

  expect(outcome).toMatchObject({ ok: true, value: { planned: 2, queued: 2, isNew: true, summary: { suppressed: 1 } } })
  expect(db.tables.sms_outbox.map((row) => row.customer_id).sort()).toEqual(['11', '12'])
  expect(db.tables.sms_outbox[0]).toMatchObject({ source: 'campaign', family: 'campaign', priority: 20 })
  expect(db.tables.sms_campaign_runs).toEqual([expect.objectContaining({ status: 'running', delivery: 'server', planned_count: 2, trigger: 'send_now' })])
})

test('a second start for the same occurrence changes nothing', async () => {
  const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
  const db = seed()
  await startCampaignRun(db.client, T, C, { trigger: 'schedule', dueAt: NOW, now: NOW })

  const again = await startCampaignRun(db.client, T, C, { trigger: 'schedule', dueAt: NOW, now: NOW })

  expect(again).toMatchObject({ ok: true, value: { isNew: false, queued: 0 } })
  expect(db.tables.sms_campaign_runs).toHaveLength(1)
  expect(db.tables.sms_outbox).toHaveLength(2)
})

test('a crashed pending run is re-planned once, without duplicates', async () => {
  const { recoverPendingRuns } = await import('@/lib/texts/server/campaign-run')
  const run = { id: 'r1', tenant_id: T, campaign_id: C, due_at: NOW.toISOString(), delivery: 'server', status: 'pending', created_at: '2026-10-14T01:50:00Z' }
  const partial = { id: 'o1', tenant_id: T, family: 'campaign', recipe: 'campaign', source: 'campaign', customer_id: '11', phone_e164: '+639170000011', occurrence_key: 'run:r1', campaign_run_id: 'r1', status: 'queued' }
  const db = seed({ sms_campaign_runs: [run], sms_outbox: [partial] })

  expect(await recoverPendingRuns(db.client, T, NOW)).toBe(1)

  expect(db.tables.sms_outbox.map((row) => row.customer_id).sort()).toEqual(['11', '12'])
  expect(db.tables.sms_campaign_runs[0]).toMatchObject({ status: 'running', planned_count: 2 })
  expect(await recoverPendingRuns(db.client, T, NOW)).toBe(0)
})

test('nobody to text completes the run at once', async () => {
  const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
  const db = seed({ customers: [] })

  const outcome = await startCampaignRun(db.client, T, C, { trigger: 'send_now', dueAt: NOW, now: NOW })

  expect(outcome).toMatchObject({ ok: true, value: { planned: 0 } })
  expect(db.tables.sms_campaign_runs[0]).toMatchObject({ status: 'completed', completed_at: NOW.toISOString() })
})

test('an unknown campaign is refused', async () => {
  const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
  expect(await startCampaignRun(seed().client, T, 'nope', { trigger: 'send_now', dueAt: NOW, now: NOW }))
    .toMatchObject({ ok: false, code: 'not_found' })
})

describe('pause wins over planning (review item 1)', () => {
  test('a paused campaign\'s pending run is not re-planned by recovery', async () => {
    const { recoverPendingRuns } = await import('@/lib/texts/server/campaign-run')
    const run = { id: 'r1', tenant_id: T, campaign_id: C, due_at: NOW.toISOString(), delivery: 'server', status: 'pending', created_at: '2026-10-14T01:50:00Z' }
    const db = seed({ sms_campaign_runs: [run] })
    db.tables.sms_campaigns[0].status = 'paused'

    expect(await recoverPendingRuns(db.client, T, NOW)).toBe(0)
    expect(db.tables.sms_outbox).toHaveLength(0)
    expect(db.tables.sms_campaign_runs[0].status).toBe('pending') // resumes later
  })

  test('starting a run for a campaign that is not scheduled queues nothing', async () => {
    const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
    const db = seed()
    db.tables.sms_campaigns[0].status = 'paused'
    const outcome = await startCampaignRun(db.client, T, C, { trigger: 'schedule', dueAt: NOW, now: NOW })
    expect(outcome).toMatchObject({ ok: true, value: { queued: 0 } })
    expect(db.tables.sms_outbox).toHaveLength(0)
  })

  test('a pause landing mid-plan is honoured: the rows just queued are withdrawn', async () => {
    const { startCampaignRun } = await import('@/lib/texts/server/campaign-run')
    let isRaced = false
    const db = seed({}, {
      beforeWrite: ({ table, mode, tables }) => {
        if (table === 'sms_outbox' && mode === 'upsert' && !isRaced) { isRaced = true; tables.sms_campaigns[0].status = 'paused' }
      },
    })
    await startCampaignRun(db.client, T, C, { trigger: 'send_now', dueAt: NOW, now: NOW })
    expect(db.tables.sms_outbox.length).toBeGreaterThan(0)
    expect(db.tables.sms_outbox.every((row) => row.status === 'cancelled' && row.skip_reason === 'paused')).toBe(true)
  })

  test('a pause mid-plan never reports a negative count when an earlier attempt already queued texts', async () => {
    const { planAndQueueRun, readCampaign } = await import('@/lib/texts/server/campaign-run')
    const run = { id: 'r1', tenant_id: T, campaign_id: C, due_at: NOW.toISOString(), delivery: 'server', status: 'running', created_at: '2026-10-14T01:50:00Z' }
    const earlier = { id: 'o1', tenant_id: T, family: 'campaign', recipe: 'campaign', source: 'campaign', customer_id: '11', phone_e164: '+639170000011', occurrence_key: 'run:r1', campaign_run_id: 'r1', status: 'queued' }
    let isRaced = false
    const db = seed({ sms_campaign_runs: [run], sms_outbox: [earlier] }, {
      beforeWrite: ({ table, mode, tables }) => {
        if (table === 'sms_outbox' && mode === 'upsert' && !isRaced) { isRaced = true; tables.sms_campaigns[0].status = 'paused' }
      },
    })
    const campaign = await readCampaign(db.client, T, C)

    const result = await planAndQueueRun(db.client, T, campaign!, 'r1', NOW, NOW)

    expect(result.queued).toBe(0)
  })
})

describe('a run that keeps failing (review item 5)', () => {
  test('records the attempt, and gives up after three', async () => {
    const { recoverPendingRuns } = await import('@/lib/texts/server/campaign-run')
    const run = { id: 'r1', tenant_id: T, campaign_id: C, due_at: NOW.toISOString(), delivery: 'server', status: 'pending', created_at: '2026-10-14T01:50:00Z', error: null }
    const db = seed({ sms_campaign_runs: [run] }, {
      beforeWrite: ({ table, mode }) => { if (table === 'sms_outbox' && mode === 'upsert') throw new Error('boom') },
    })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    for (const expected of ['plan_failed_1', 'plan_failed_2']) {
      await recoverPendingRuns(db.client, T, NOW)
      expect(db.tables.sms_campaign_runs[0]).toMatchObject({ status: 'pending', error: expected })
    }
    await recoverPendingRuns(db.client, T, NOW)
    expect(db.tables.sms_campaign_runs[0]).toMatchObject({ status: 'cancelled', error: 'plan_failed' })
    errorSpy.mockRestore()
  })
})
