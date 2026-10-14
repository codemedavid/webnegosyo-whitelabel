/** @jest-environment node */
/**
 * The read side the Texts page and the live endpoint call: the campaign list
 * (derived chips, results, progress), the audience preview (reach, skipped
 * buckets, masked samples, texts used, finish time), the report and the
 * 30-day line.
 */

import { TEXTS_UNIQUE, createFakeDb } from './fake-db'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/loyalty/otp-delivery', () => ({ readGatewayStatus: async () => null }))

const T = 't1'
const NOW = new Date('2026-10-14T02:00:00Z') // Wed 10:00 Manila

function campaign(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, tenant_id: T, name: id, message_template: 'Hi {{firstName}}!', audience: {}, schedule_kind: 'one_off', schedule_time: '10:00',
    schedule_date: '2026-10-16', schedule_interval_days: null, schedule_weekdays: [], ends_on: null, status: 'scheduled', delivery: 'server',
    pause_reason: null, scheduled_from: '2026-10-13T00:00:00Z', created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z', ...overrides,
  }
}

function guest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, tenant_id: T, name: 'Maria Santos', phone_e164: `+6391700000${id}`, sms_consent: true, sms_opt_out: false, order_count: 3,
    total_spent: 900, first_order_at: null, last_order_at: '2026-10-10T00:00:00Z', top_items: [], channels_used: [], ...overrides,
  }
}

function seed(tables: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    tenants: [{ id: T, name: 'Kainan', order_backend: 'platform' }],
    sms_settings: [{ tenant_id: T, quiet_hours_start: '21:00', quiet_hours_end: '08:00', guest_cap_days: 3, daily_limit: 2, opt_out_line: 'Reply STOP to opt out', review_url: null }],
    customers: [guest('11'), guest('12'), guest('13'), guest('14', { sms_consent: false }), guest('15', { phone_e164: null }), guest('16', { sms_opt_out: true })],
    sms_campaigns: [], sms_campaign_runs: [], sms_outbox: [], sms_sends: [], sms_suppressions: [], orders: [],
    loyalty_sms_devices: [{ device_id: 'd1', tenant_id: T, enabled: true }],
    loyalty_sms_device_heartbeats: [{ device_id: 'd1', tenant_id: T, last_seen_at: '2026-10-14T01:59:00Z' }],
    ...tables,
  }, { unique: TEXTS_UNIQUE })
}

describe('previewCampaignAudience', () => {
  test('reach, skipped buckets, masked samples, texts used and the days it takes', async () => {
    const { previewCampaignAudience } = await import('@/lib/texts/server/campaign-reads')
    const db = seed({ sms_outbox: [{ id: 'w1', tenant_id: T, phone_e164: '+639170000013', status: 'queued', expires_at: '2026-10-20T00:00:00Z', campaign_run_id: null }] })

    const preview = await previewCampaignAudience(db.client, T, { audience: {}, messageTemplate: 'Hi {{firstName}}!' }, NOW)

    expect(preview).toMatchObject({
      reach: 2,
      skipped: { no_phone: 1, no_consent: 1, opted_out: 1, recently_texted: 1 },
      segmentsPerGuest: 1,
      textsUsed: 2,
      waitingAhead: 1,
      dailyLimit: 2,
      daysToFinish: 2,
    })
    expect(preview.samples[0]).toEqual({ label: 'Maria S.', body: 'Hi Maria! Reply STOP to opt out' })
    expect(preview.finishAt).toBe('2026-10-15T00:00:00.000Z') // 3 texts at 2 a day: tomorrow 8:00 AM
  })

  test('nobody to text still shows how a text reads', async () => {
    const { previewCampaignAudience } = await import('@/lib/texts/server/campaign-reads')
    const preview = await previewCampaignAudience(seed({ customers: [] }).client, T, { audience: {}, messageTemplate: 'Hi {{firstName}}!' }, NOW)
    expect(preview).toMatchObject({ reach: 0, skipped: {}, textsUsed: 0, segmentsPerGuest: 1 })
    expect(preview.samples).toEqual([{ label: 'Sample guest', body: 'Hi Maria! Reply STOP to opt out' }])
  })
})

describe('listCampaignsView', () => {
  test('derives chips, sorts by what needs eyes first, and adds results', async () => {
    const { listCampaignsView } = await import('@/lib/texts/server/campaign-reads')
    const db = seed({
      sms_campaigns: [
        campaign('draft', { status: 'draft', updated_at: '2026-10-13T05:00:00Z' }),
        campaign('sending'),
        campaign('soon', { schedule_date: '2026-10-15' }),
        campaign('app', { status: 'active', delivery: 'phone', schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [5] }),
      ],
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'sending', status: 'running', delivery: 'server', due_at: '2026-10-14T01:00:00Z', started_at: '2026-10-14T01:00:00Z', planned_count: 2 }],
      sms_outbox: [
        { id: 'o1', tenant_id: T, campaign_run_id: 'r1', customer_id: '11', phone_e164: '+639170000011', status: 'sent', sent_at: '2026-10-14T01:10:00Z', expires_at: '2026-10-17T00:00:00Z' },
        { id: 'o2', tenant_id: T, campaign_run_id: 'r1', customer_id: '12', phone_e164: '+639170000012', status: 'queued', sent_at: null, expires_at: '2026-10-17T00:00:00Z' },
      ],
    })

    const items = await listCampaignsView(db.client, T, NOW)

    expect(items.map((item) => [item.id, item.displayState])).toEqual([
      ['sending', 'sending'], ['soon', 'scheduled'], ['app', 'app_managed'], ['draft', 'draft'],
    ])
    expect(items[0].progress).toMatchObject({ runId: 'r1', sent: 1, waiting: 1, total: 2, isWaitingForPhone: false })
    expect(items[0].results).toMatchObject({ sent: 1, notSent: 0, isFinal: false, isApproximate: false })
    expect(items[1].whenLabel).toBe('Starts Thu, 10:00 AM')
  })
})

describe('readCampaignProgress', () => {
  test('one entry per open server run, keyed by campaign', async () => {
    const { readCampaignProgress } = await import('@/lib/texts/server/campaign-reads')
    const db = seed({
      sms_campaign_runs: [
        { id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'running', delivery: 'server', planned_count: 3 },
        { id: 'r2', tenant_id: T, campaign_id: 'c2', status: 'completed', delivery: 'server', planned_count: 3 },
      ],
      sms_outbox: [{ id: 'o1', tenant_id: T, campaign_run_id: 'r1', status: 'failed', expires_at: '2026-10-17T00:00:00Z' }],
      loyalty_sms_device_heartbeats: [],
    })
    expect(await readCampaignProgress(db.client, T, NOW)).toEqual({
      c1: { runId: 'r1', sent: 0, notSent: 1, waiting: 0, total: 3, finishAt: null, isQuietNow: false, isWaitingForPhone: true },
    })
  })
})

describe('getCampaignReport', () => {
  test('totals, runs and a masked guest page', async () => {
    const { getCampaignReport } = await import('@/lib/texts/server/campaign-reads')
    const db = seed({
      sms_campaigns: [campaign('c1', { schedule_date: '2026-10-10' })],
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'completed', delivery: 'server', due_at: '2026-10-10T02:00:00Z', started_at: '2026-10-10T02:00:00Z' }],
      sms_outbox: [
        { id: 'o1', tenant_id: T, campaign_run_id: 'r1', customer_id: '11', phone_e164: '+639170004567', status: 'sent', sent_at: '2026-10-10T03:00:00Z', expires_at: '2026-10-13T00:00:00Z' },
        { id: 'o2', tenant_id: T, campaign_run_id: 'r1', customer_id: '12', phone_e164: '+639170001234', status: 'expired', skip_reason: 'expired', sent_at: null, expires_at: '2026-10-13T00:00:00Z' },
      ],
      orders: [{ id: 'x1', tenant_id: T, customer_id: '11', created_at: '2026-10-12T00:00:00Z', total: 320, status: 'delivered' }],
    })

    const report = await getCampaignReport(db.client, T, 'c1', null, NOW)

    expect(report?.campaign.displayState).toBe('sent')
    expect(report?.totals).toMatchObject({ sent: 1, notSent: 1, cameBack: 1, sales: 320 })
    expect(report?.runs).toEqual([expect.objectContaining({ runId: 'r1', notSentByReason: [{ reason: 'Ran out of time', count: 1 }] })])
    expect(report?.guests).toEqual([
      { label: 'Guest · ending 4567', status: 'sent', reason: null, sentAt: '2026-10-10T03:00:00Z', orderedAt: '2026-10-12T00:00:00Z', orderTotal: 320 },
      { label: 'Guest · ending 1234', status: 'not_sent', reason: 'Ran out of time', sentAt: null, orderedAt: null, orderTotal: null },
    ])
    expect(report?.nextCursor).toBeNull()
  })

  test('an unknown campaign is null', async () => {
    const { getCampaignReport } = await import('@/lib/texts/server/campaign-reads')
    expect(await getCampaignReport(seed().client, T, 'nope', null, NOW)).toBeNull()
  })
})

describe('readThirtyDayLine', () => {
  test('campaigns and automations: sent, came back, their first orders', async () => {
    const { readThirtyDayLine } = await import('@/lib/texts/server/campaign-reads')
    const db = seed({
      sms_outbox: [
        { id: 'o1', tenant_id: T, customer_id: '11', status: 'sent', sent_at: '2026-10-05T00:00:00Z', source: 'auto' },
        { id: 'o2', tenant_id: T, customer_id: '12', status: 'sent', sent_at: '2026-10-06T00:00:00Z', source: 'campaign' },
        { id: 'o3', tenant_id: T, customer_id: '13', status: 'sent', sent_at: '2026-08-01T00:00:00Z', source: 'campaign' },
      ],
      sms_sends: [{ id: 's1', tenant_id: T, customer_id: '11', result: 'sent', sent_at: '2026-10-07T00:00:00Z' }],
      orders: [{ id: 'x1', tenant_id: T, customer_id: '11', created_at: '2026-10-08T00:00:00Z', total: 250, status: 'ready' }],
    })
    expect(await readThirtyDayLine(db.client, T, NOW)).toEqual({ sent: 3, cameBack: 1, sales: 250 })
  })
})
