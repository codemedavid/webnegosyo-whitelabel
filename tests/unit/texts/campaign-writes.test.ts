/** @jest-environment node */
/**
 * Campaign writes: drafts are server campaigns from birth, going live needs a
 * valid message and time (a phone is NOT required — it waits), Send now is a
 * no-op the second time, Pause withdraws waiting texts and Resume puts them
 * back, a missed one-off must be rescheduled, and a phone campaign switches
 * to automatic only while its phone is not mid-send.
 */

import { TEXTS_UNIQUE, createFakeDb } from './fake-db'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/loyalty/otp-delivery', () => ({ readGatewayStatus: async () => null }))
const mockChat = jest.fn()
jest.mock('@/lib/ai/openrouter', () => ({ openRouterChat: (...args: unknown[]) => mockChat(...args) }))

const T = 't1'
const U = 'u1'
const NOW = new Date('2026-10-14T02:00:00Z') // Wed 10:00 Manila

const DRAFT = {
  name: 'Weekend reminder',
  messageTemplate: 'Hi {{firstName}}, see you this weekend!',
  audience: { minOrderCount: 3 },
  schedule: { kind: 'one_off' as const, time: '10:00', date: '2026-10-16', intervalDays: null, weekdays: [], endsOn: null },
}

function campaign(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, tenant_id: T, name: id, message_template: 'Hi {{firstName}}!', audience: {}, schedule_kind: 'one_off', schedule_time: '10:00',
    schedule_date: '2026-10-16', schedule_interval_days: null, schedule_weekdays: [], ends_on: null, status: 'draft', delivery: 'server',
    pause_reason: null, scheduled_from: null, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z', ...overrides,
  }
}

function seed(tables: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    tenants: [{ id: T, name: 'Kainan', order_backend: 'platform' }],
    sms_settings: [{ tenant_id: T, quiet_hours_start: '21:00', quiet_hours_end: '08:00', guest_cap_days: 3, daily_limit: 100, opt_out_line: null, review_url: null }],
    customers: [{ id: 'g1', tenant_id: T, name: 'Ana Cruz', phone_e164: '+639170000001', sms_consent: true, sms_opt_out: false, order_count: 4, total_spent: 900, last_order_at: '2026-10-01T00:00:00Z', top_items: [], channels_used: [] }],
    sms_campaigns: [], sms_campaign_runs: [], sms_outbox: [], sms_sends: [], sms_suppressions: [],
    loyalty_sms_devices: [], loyalty_sms_device_heartbeats: [],
    ...tables,
  }, { unique: TEXTS_UNIQUE })
}

const PHONE = { loyalty_sms_devices: [{ device_id: 'd1', tenant_id: T, enabled: true }], loyalty_sms_device_heartbeats: [{ device_id: 'd1', tenant_id: T, last_seen_at: NOW.toISOString() }] }

describe('saveCampaignDraft', () => {
  test('a new draft is a server campaign with the store quiet hours copied', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    const db = seed()
    const outcome = await saveCampaignDraft(db.client, T, U, DRAFT)
    expect(outcome.ok).toBe(true)
    expect(db.tables.sms_campaigns[0]).toMatchObject({
      status: 'draft', delivery: 'server', created_by: U, schedule_date: '2026-10-16', ends_on: null,
      quiet_hours_start: '21:00', quiet_hours_end: '08:00', message_template: DRAFT.messageTemplate,
    })
  })

  test('refuses an invalid draft with the first reason', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    expect(await saveCampaignDraft(seed().client, T, U, { ...DRAFT, messageTemplate: 'Hi {{discount}}' }))
      .toMatchObject({ ok: false, code: 'invalid', error: "We don't know {{discount}}. Use the chips above." })
  })

  test('a one-off that already went out is locked', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({
      sms_campaigns: [campaign('c1', { status: 'scheduled' })],
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'completed', delivery: 'server', due_at: '2026-10-13T02:00:00Z' }],
    })
    expect(await saveCampaignDraft(db.client, T, U, { ...DRAFT, id: '00000000-0000-4000-8000-0000000000c1' })).toMatchObject({ ok: false, code: 'not_found' })
    db.tables.sms_campaigns[0].id = '00000000-0000-4000-8000-0000000000c1'
    db.tables.sms_campaign_runs[0].campaign_id = '00000000-0000-4000-8000-0000000000c1'
    expect(await saveCampaignDraft(db.client, T, U, { ...DRAFT, id: '00000000-0000-4000-8000-0000000000c1' })).toMatchObject({ ok: false, code: 'locked' })
  })
})

describe('editing a live campaign', () => {
  test('"Save draft" on a scheduled campaign edits content and keeps it scheduled', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    const id = '00000000-0000-4000-8000-0000000000d1'
    const db = seed({ sms_campaigns: [campaign(id, { status: 'scheduled', scheduled_from: NOW.toISOString() })] })
    expect(await saveCampaignDraft(db.client, T, U, { ...DRAFT, id, name: 'Renamed' }, NOW)).toEqual({ ok: true, value: { id } })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ name: 'Renamed', status: 'scheduled', delivery: 'server', scheduled_from: NOW.toISOString() })
  })
})

describe('review items 1, 2 and 6', () => {
  test('editing a scheduled one-off to a time already past is refused (it would send at once)', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    const id = '00000000-0000-4000-8000-0000000000d2'
    const db = seed({ sms_campaigns: [campaign(id, { status: 'scheduled' })] })
    const past = { ...DRAFT, id, schedule: { ...DRAFT.schedule, date: '2026-10-12' } }
    expect(await saveCampaignDraft(db.client, T, U, past, NOW)).toMatchObject({ ok: false, code: 'invalid', error: 'Pick a time from now on.' })
    expect(await saveCampaignDraft(db.client, T, U, { ...past, schedule: { ...DRAFT.schedule } }, NOW)).toMatchObject({ ok: true })
  })

  test('a draft may still hold a past time', async () => {
    const { saveCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    expect(await saveCampaignDraft(seed().client, T, U, { ...DRAFT, schedule: { ...DRAFT.schedule, date: '2026-10-12' } }, NOW)).toMatchObject({ ok: true })
  })

  test('going live inside quiet hours is refused with the store window', async () => {
    const { scheduleCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', { schedule_time: '22:00' })] })
    expect(await scheduleCampaign(db.client, T, 'c1', NOW)).toMatchObject({
      ok: false, code: 'invalid', error: "That's inside quiet hours (9 PM–8 AM). Pick a time after 8 AM.",
    })
  })

  test('pause also withdraws a run that opened while it was pausing', async () => {
    const { pauseCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', { status: 'scheduled' })] })
    // Planning raced the pause: a run + queued text appear just as the status flips.
    db.tables.sms_campaigns[0].status = 'scheduled'
    const raced = createFakeDb(db.tables, {
      unique: TEXTS_UNIQUE,
      beforeWrite: ({ table, mode, tables }) => {
        if (table !== 'sms_campaigns' || mode !== 'update' || tables.sms_campaign_runs.length > 0) return
        tables.sms_campaign_runs.push({ id: 'late', tenant_id: T, campaign_id: 'c1', status: 'running', delivery: 'server', due_at: NOW.toISOString() })
        tables.sms_outbox.push({ id: 'o9', tenant_id: T, campaign_run_id: 'late', status: 'queued', expires_at: '2026-10-17T00:00:00Z' })
      },
    })
    expect(await pauseCampaign(raced.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(raced.tables.sms_outbox[0]).toMatchObject({ status: 'cancelled', skip_reason: 'paused' })
  })
})

describe('"Now" from the composer: today, the current Manila minute', () => {
  const nowish = new Date('2026-10-14T02:00:45Z') // 10:00:45 Manila
  const nowDraft = { ...DRAFT, schedule: { ...DRAFT.schedule, date: '2026-10-14', time: '10:00' } }

  test('saves, then sends — the current minute is not "in the past"', async () => {
    const { saveCampaignDraft, sendCampaignNow } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ ...PHONE })
    const saved = await saveCampaignDraft(db.client, T, U, nowDraft)
    if (!saved.ok) throw new Error(saved.error)
    expect(await sendCampaignNow(db.client, T, saved.value.id, nowish)).toMatchObject({ ok: true, value: { queued: 1 } })
  })

  test('schedule accepts it too', async () => {
    const { saveCampaignDraft, scheduleCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed()
    const saved = await saveCampaignDraft(db.client, T, U, nowDraft)
    if (!saved.ok) throw new Error(saved.error)
    expect(await scheduleCampaign(db.client, T, saved.value.id, nowish)).toMatchObject({ ok: true })
  })
})

describe('scheduleCampaign', () => {
  test('goes live without a phone — it waits for one', async () => {
    const { scheduleCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1')] })
    expect(await scheduleCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: { displayState: 'scheduled' } })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'scheduled', delivery: 'server', scheduled_from: NOW.toISOString() })
  })

  test('refuses a time that already passed and a phone-run campaign', async () => {
    const { scheduleCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('past', { schedule_date: '2026-10-12' }), campaign('app', { status: 'active', delivery: 'phone' })] })
    expect(await scheduleCampaign(db.client, T, 'past', NOW)).toMatchObject({ ok: false, code: 'invalid', error: 'Pick a time from now on.' })
    expect(await scheduleCampaign(db.client, T, 'app', NOW)).toMatchObject({ ok: false, code: 'app_managed' })
  })
})

describe('sendCampaignNow', () => {
  test('queues now with a phone, and a second tap is refused', async () => {
    const { sendCampaignNow } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1')], ...PHONE })
    const outcome = await sendCampaignNow(db.client, T, 'c1', NOW)
    expect(outcome).toMatchObject({ ok: true, value: { queued: 1 } })
    expect(outcome.ok && outcome.value.finishAt).toBeTruthy()
    expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'scheduled', schedule_date: '2026-10-14', schedule_time: '10:00' })
    expect(await sendCampaignNow(db.client, T, 'c1', NOW)).toMatchObject({ ok: false, code: 'already_sending' })
  })

  test('without a phone it is saved and waits', async () => {
    const { sendCampaignNow } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1')] })
    expect(await sendCampaignNow(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: { queued: 0, finishAt: null } })
    expect(db.tables.sms_campaign_runs).toHaveLength(0)
    expect(db.tables.sms_campaigns[0].status).toBe('scheduled')
  })

  test('a one-off that already went out is not sent twice', async () => {
    const { sendCampaignNow } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({
      sms_campaigns: [campaign('c1', { status: 'scheduled' })], ...PHONE,
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'completed', delivery: 'server', due_at: '2026-10-13T02:00:00Z' }],
    })
    expect(await sendCampaignNow(db.client, T, 'c1', NOW)).toMatchObject({ ok: false, code: 'already_sent' })
  })
})

describe('pause / resume', () => {
  function sending() {
    return seed({
      sms_campaigns: [campaign('c1', { status: 'scheduled', schedule_date: '2026-10-14' })],
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'running', delivery: 'server', due_at: '2026-10-14T02:00:00Z' }],
      sms_outbox: [
        { id: 'o1', tenant_id: T, campaign_run_id: 'r1', status: 'queued', skip_reason: null, expires_at: '2026-10-17T00:00:00Z' },
        { id: 'o2', tenant_id: T, campaign_run_id: 'r1', status: 'sent', skip_reason: null, expires_at: '2026-10-17T00:00:00Z' },
      ],
    })
  }

  test('pause withdraws waiting texts but keeps the run open; resume puts them back', async () => {
    const { pauseCampaign, resumeCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = sending()

    expect(await pauseCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'paused', pause_reason: 'owner' })
    expect(db.tables.sms_outbox.map((o) => [o.id, o.status, o.skip_reason])).toEqual([['o1', 'cancelled', 'paused'], ['o2', 'sent', null]])
    expect(db.tables.sms_campaign_runs[0].status).toBe('running')

    expect(await resumeCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'scheduled', scheduled_from: NOW.toISOString() })
    expect(db.tables.sms_outbox[0]).toMatchObject({ status: 'queued', skip_reason: null })
  })

  test('a one-off that missed its day must be rescheduled, not resumed', async () => {
    const { resumeCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', { status: 'paused', pause_reason: 'missed_no_phone', schedule_date: '2026-10-11' })] })
    expect(await resumeCampaign(db.client, T, 'c1', NOW)).toMatchObject({ ok: false, code: 'reschedule' })
  })

  test('a phone campaign resumes on the phone', async () => {
    const { resumeCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', { status: 'paused', delivery: 'phone' })] })
    expect(await resumeCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns[0].status).toBe('active')
  })
})

describe('archive / unarchive / delete / duplicate', () => {
  test('archive closes the open run and withdraws its waiting texts', async () => {
    const { archiveCampaign, unarchiveCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({
      sms_campaigns: [campaign('c1', { status: 'scheduled' })],
      sms_campaign_runs: [{ id: 'r1', tenant_id: T, campaign_id: 'c1', status: 'running', delivery: 'server', due_at: '2026-10-14T02:00:00Z' }],
      sms_outbox: [{ id: 'o1', tenant_id: T, campaign_run_id: 'r1', status: 'queued', expires_at: '2026-10-17T00:00:00Z' }],
    })
    expect(await archiveCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_outbox[0]).toMatchObject({ status: 'cancelled', skip_reason: 'archived' })
    expect(db.tables.sms_campaign_runs[0]).toMatchObject({ status: 'completed', completed_at: NOW.toISOString() })
    expect(await unarchiveCampaign(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ status: 'paused', pause_reason: 'owner' })
  })

  test('only drafts can be deleted', async () => {
    const { deleteCampaignDraft } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('d1'), campaign('s1', { status: 'scheduled' })] })
    expect(await deleteCampaignDraft(db.client, T, 's1', NOW)).toMatchObject({ ok: false, code: 'not_draft' })
    expect(await deleteCampaignDraft(db.client, T, 'd1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns.map((c) => c.id)).toEqual(['s1'])
  })

  test('duplicate is always a fresh draft called "Copy of …"', async () => {
    const { duplicateCampaign } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', { status: 'scheduled', name: 'Promo' })] })
    const outcome = await duplicateCampaign(db.client, T, U, 'c1')
    expect(outcome.ok).toBe(true)
    expect(db.tables.sms_campaigns[1]).toMatchObject({ name: 'Copy of Promo', status: 'draft', delivery: 'server', created_by: U })
  })
})

describe('switchToAutomatic', () => {
  const weekly = { status: 'active', delivery: 'phone', schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [5], ends_on: null }

  test('refuses while the phone is mid-send', async () => {
    const { switchToAutomatic } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({
      sms_campaigns: [campaign('c1', weekly)],
      sms_campaign_runs: [{ id: 'p1', tenant_id: T, campaign_id: 'c1', status: 'running', delivery: 'phone', due_at: '2026-10-14T01:00:00Z', claimed_at: '2026-10-14T01:50:00Z' }],
    })
    expect(await switchToAutomatic(db.client, T, 'c1', NOW)).toMatchObject({ ok: false, code: 'phone_sending' })
  })

  test('an active phone campaign becomes a scheduled server one with an end date', async () => {
    const { switchToAutomatic } = await import('@/lib/texts/server/campaign-writes')
    const db = seed({ sms_campaigns: [campaign('c1', weekly)] })
    expect(await switchToAutomatic(db.client, T, 'c1', NOW)).toEqual({ ok: true, value: null })
    expect(db.tables.sms_campaigns[0]).toMatchObject({ delivery: 'server', status: 'scheduled', scheduled_from: NOW.toISOString(), ends_on: '2026-12-09' })
  })
})

describe('writeCampaignMessages', () => {
  test('keeps only messages that invent nothing and fit two texts', async () => {
    const { writeCampaignMessages } = await import('@/lib/texts/server/campaign-writes')
    mockChat.mockResolvedValue({ content: JSON.stringify({ messages: [
      'Hi {{firstName}}! We miss you at {{storeName}}. Drop by soon!',
      'Hi {{firstName}}, 50% off today only!',
      'Hi {{firstName}}, use {{discountCode}}',
    ] }) })
    const outcome = await writeCampaignMessages(seed().client, T, { name: 'Win back', audiencePreset: 'lapsed', language: 'en' })
    expect(outcome).toEqual({ ok: true, value: { messages: ['Hi {{firstName}}! We miss you at {{storeName}}. Drop by soon!'] } })
  })

  test('says so when nothing passes', async () => {
    const { writeCampaignMessages } = await import('@/lib/texts/server/campaign-writes')
    mockChat.mockResolvedValue({ content: '{"messages": ["FREE stuff!!!"]}' })
    expect(await writeCampaignMessages(seed().client, T, { name: 'x', audiencePreset: 'everyone', language: 'tl' })).toMatchObject({ ok: false, code: 'write_failed' })
  })
})
