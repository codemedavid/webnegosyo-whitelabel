/** @jest-environment node */
/**
 * The Texts page's poll. It reads only what changes fast — the phone hero,
 * Needs attention, open-run progress — from bounded queries (never the
 * campaign list), each part degrades on its own, several tabs of one store
 * share one read for a few seconds, and the route is gated, never
 * browser-cached, and never leaks an error.
 */

import { NextRequest } from 'next/server'

const requireTextsAccess = jest.fn()
const readCampaignProgress = jest.fn()
const listCampaignsView = jest.fn()
const readSenderSummary = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db() }))
jest.mock('@/lib/texts/gate', () => ({ requireTextsAccess: (...args: unknown[]) => requireTextsAccess(...args) }))
jest.mock('@/lib/texts/server/campaign-reads', () => ({
  readCampaignProgress: (...args: unknown[]) => readCampaignProgress(...args),
  listCampaignsView: (...args: unknown[]) => listCampaignsView(...args),
}))
jest.mock('@/lib/texts/server/sender-summary', () => ({
  readSenderSummary: (...args: unknown[]) => readSenderSummary(...args),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const NOW = new Date('2026-10-14T02:00:00Z') // 10:00 AM Manila, Wednesday
const SENDER = {
  heroState: 'offline', primary: null, phones: [], maxPhones: 5, waiting: 4, sentToday: 0, dailyLimit: 100,
  isQuietNow: false, quietUntil: null, allOutBy: null, sending: null, now: NOW.toISOString(),
}
const run = { runId: 'r1', sent: 1, notSent: 0, waiting: 3, total: 4, finishAt: null, isQuietNow: false, isWaitingForPhone: true }

function campaignRow(overrides: Record<string, unknown>) {
  return {
    id: 'c1', name: 'Promo', schedule_kind: 'one_off', schedule_time: '14:00', schedule_date: '2026-10-14',
    schedule_interval_days: null, schedule_weekdays: [], ends_on: null, status: 'scheduled', delivery: 'server',
    pause_reason: null, scheduled_from: '2026-10-13T00:00:00Z', created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z',
    ...overrides,
  }
}

/** A query builder that records its filters and answers every terminal call with `result`. */
function query(result: unknown, calls: string[]) {
  const chain: Record<string, unknown> = {}
  for (const key of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
    chain[key] = (...args: unknown[]) => { calls.push(`${key}:${JSON.stringify(args)}`); return chain }
  }
  chain.maybeSingle = async () => result
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain
}

let tables: Record<string, unknown> = {}
const queries: Record<string, string[]> = {}

function db() {
  const defaults: Record<string, unknown> = {
    sms_settings: { data: { quiet_hours_start: '21:00', quiet_hours_end: '08:00', guest_cap_days: 3, daily_limit: 100, opt_out_line: null, review_url: null }, error: null },
    sms_automations: { count: 1, error: null },
    sms_campaigns: { data: [], error: null },
    sms_campaign_runs: { data: [], error: null },
  }
  return {
    from: (table: string) => {
      queries[table] = queries[table] ?? []
      return query(table in tables ? tables[table] : defaults[table], queries[table])
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  tables = {}
  for (const key of Object.keys(queries)) delete queries[key]
  readSenderSummary.mockResolvedValue(SENDER)
  readCampaignProgress.mockResolvedValue({ c1: run })
  listCampaignsView.mockResolvedValue([])
})

const live = () => import('@/lib/texts/server/live')

describe('readTextsLive', () => {
  it('reads progress once, hands it to the hero, and never lists campaigns', async () => {
    const { readTextsLive } = await live()
    const result = await readTextsLive(db() as never, TENANT, NOW)
    expect(readCampaignProgress).toHaveBeenCalledTimes(1)
    expect(readSenderSummary).toHaveBeenCalledWith(expect.anything(), TENANT, NOW, { progress: { c1: run } })
    expect(listCampaignsView).not.toHaveBeenCalled()
    expect(result.progress).toEqual({ c1: run })
    expect(result.attention.map((item) => item.kind)).toEqual(['waiting_no_phone', 'review_link_missing'])
  })

  it('reads campaigns with a bounded select of live server campaigns only', async () => {
    const { readTextsLive } = await live()
    tables.sms_campaigns = { data: [campaignRow({})], error: null }
    await readTextsLive(db() as never, TENANT, NOW)
    expect(queries.sms_campaigns).toEqual(expect.arrayContaining([
      'eq:["delivery","server"]', 'in:["status",["scheduled","paused"]]', expect.stringMatching(/^limit:\[\d+\]$/),
    ]))
    expect(queries.sms_campaigns.join()).not.toContain('message_template')
    expect(queries.sms_campaign_runs).toEqual(expect.arrayContaining(['in:["campaign_id",["c1"]]', expect.stringMatching(/^limit:\[\d+\]$/)]))
  })

  it('finds a campaign that paused itself, one starting soon while offline, and one no one matches', async () => {
    tables.sms_campaigns = { data: [
      campaignRow({ id: 'p', name: 'Weekend', status: 'paused', pause_reason: 'missed_no_phone' }),
      campaignRow({ id: 's', name: 'Friday promo' }),
      campaignRow({ id: 'e', name: 'Regulars', schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [5], ends_on: '2026-12-31', schedule_time: '10:00' }),
    ], error: null }
    tables.sms_campaign_runs = { data: [
      { campaign_id: 'e', status: 'completed', due_at: '2026-10-10T02:00:00Z', planned_count: 0 },
      { campaign_id: 'e', status: 'completed', due_at: '2026-10-03T02:00:00Z', planned_count: 9 },
    ], error: null }
    const { readTextsLive } = await live()
    const result = await readTextsLive(db() as never, TENANT, NOW)
    expect(result.attention.map((item) => item.id)).toEqual([
      'waiting_no_phone', 'campaign_paused_itself:p', 'starts_soon_offline:s', 'campaign_no_one:e', 'review_link_missing',
    ])
    expect(result.attention.find((item) => item.id === 'starts_soon_offline:s')?.text).toBe('Friday promo starts at 2:00 PM and your phone is offline.')
  })

  it('does not flag a campaign whose latest run found people, even if an older one found no one', async () => {
    tables.sms_campaigns = { data: [campaignRow({ id: 'e', schedule_kind: 'weekly', schedule_date: null, schedule_weekdays: [5], ends_on: '2026-12-31' })], error: null }
    tables.sms_campaign_runs = { data: [
      { campaign_id: 'e', status: 'completed', due_at: '2026-10-10T02:00:00Z', planned_count: 4 },
      { campaign_id: 'e', status: 'completed', due_at: '2026-10-03T02:00:00Z', planned_count: 0 },
    ], error: null }
    const { readTextsLive } = await live()
    expect((await readTextsLive(db() as never, TENANT, NOW)).attention.some((item) => item.kind === 'campaign_no_one')).toBe(false)
  })

  it('keeps everything else when the campaign rows cannot be worked out', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    tables.sms_campaigns = { data: [campaignRow({ id: 'x', schedule_time: null })], error: null }
    tables.sms_settings = { data: { review_url: null }, error: null }
    const { readTextsLive } = await live()
    const result = await readTextsLive(db() as never, TENANT, NOW)
    expect(result.sender).toBe(SENDER)
    expect(result.attention[0].kind).toBe('waiting_no_phone')
    errorSpy.mockRestore()
  })

  it('keeps the phone state and other rows when campaign reads fail', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    readCampaignProgress.mockRejectedValue(new Error('column delivery does not exist'))
    tables.sms_campaigns = { data: null, error: { message: 'nope' } }
    const { readTextsLive } = await live()
    const result = await readTextsLive(db() as never, TENANT, NOW)
    expect(result.sender).toBe(SENDER)
    expect(result.progress).toEqual({})
    expect(result.attention.map((item) => item.kind)).toEqual(['waiting_no_phone', 'review_link_missing'])
    errorSpy.mockRestore()
  })
})

describe('readTextsLiveCached', () => {
  it('shares one read per store for a few seconds, then reads again', async () => {
    const { readTextsLiveCached, LIVE_CACHE_MS } = await live()
    const first = await readTextsLiveCached(db() as never, TENANT, NOW)
    const again = await readTextsLiveCached(db() as never, TENANT, new Date(NOW.getTime() + LIVE_CACHE_MS - 1))
    expect(again).toBe(first)
    expect(readCampaignProgress).toHaveBeenCalledTimes(1)
    await readTextsLiveCached(db() as never, TENANT, new Date(NOW.getTime() + LIVE_CACHE_MS))
    expect(readCampaignProgress).toHaveBeenCalledTimes(2)
  })

  it('keeps stores apart and forgets a store after a write', async () => {
    const { readTextsLiveCached, forgetTextsLive } = await live()
    const later = new Date(NOW.getTime() + 60_000)
    await readTextsLiveCached(db() as never, TENANT, later)
    await readTextsLiveCached(db() as never, 'other-store', later)
    expect(readCampaignProgress).toHaveBeenCalledTimes(2)
    forgetTextsLive(TENANT)
    await readTextsLiveCached(db() as never, TENANT, later)
    expect(readCampaignProgress).toHaveBeenCalledTimes(3)
  })

  it('does not keep a failed read', async () => {
    const { readTextsLiveCached } = await live()
    const later = new Date(NOW.getTime() + 120_000)
    readSenderSummary.mockRejectedValueOnce(new Error('boom'))
    await expect(readTextsLiveCached(db() as never, TENANT, later)).rejects.toThrow('boom')
    await expect(readTextsLiveCached(db() as never, TENANT, later)).resolves.toMatchObject({ sender: SENDER })
  })
})

describe('readReviewLinkMissing', () => {
  it('is true only when review request is on and there is no link', async () => {
    const { readReviewLinkMissing } = await live()
    expect(await readReviewLinkMissing(db() as never, TENANT)).toBe(true)
    tables.sms_settings = { data: { review_url: 'https://g.page/r/x' }, error: null }
    expect(await readReviewLinkMissing(db() as never, TENANT)).toBe(false)
    tables = { sms_automations: { count: 0, error: null } }
    expect(await readReviewLinkMissing(db() as never, TENANT)).toBe(false)
  })
})

describe('GET /api/admin/texts/live', () => {
  const get = async (query: string) => {
    const { GET } = await import('@/app/api/admin/texts/live/route')
    return GET(new NextRequest(`https://example.com/api/admin/texts/live${query}`))
  }

  beforeEach(async () => (await live()).forgetTextsLive(TENANT))

  it('is 400 without a valid tenant, before the gate', async () => {
    expect((await get('?tenantId=shop')).status).toBe(400)
    expect(requireTextsAccess).not.toHaveBeenCalled()
  })

  it('is 403 JSON when the gate refuses', async () => {
    requireTextsAccess.mockRejectedValue(new Error('Unauthorized: Texts are for the whole store'))
    const response = await get(`?tenantId=${TENANT}`)
    expect(response.status).toBe(403)
    expect(await response.json()).toHaveProperty('error')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(readSenderSummary).not.toHaveBeenCalled()
  })

  it('answers the live view, never browser-cached, gated as a read', async () => {
    requireTextsAccess.mockResolvedValue({ userId: 'u1', isOwner: true })
    const response = await get(`?tenantId=${TENANT.toUpperCase()}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(requireTextsAccess).toHaveBeenCalledWith(TENANT, 'view')
    expect(Object.keys(await response.json()).sort()).toEqual(['attention', 'progress', 'sender'])
  })

  it('is a friendly 500 that leaks nothing when the read throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    requireTextsAccess.mockResolvedValue({ userId: 'u1', isOwner: true })
    readSenderSummary.mockRejectedValue(new Error('relation "secret" does not exist'))
    const response = await get(`?tenantId=${TENANT}`)
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret')
    errorSpy.mockRestore()
  })
})
