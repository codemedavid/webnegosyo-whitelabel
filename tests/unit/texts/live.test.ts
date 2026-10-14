/** @jest-environment node */
/**
 * The Texts page's poll. Each part degrades on its own (a failed campaign
 * read never hides the phone state), campaign progress is read once per
 * poll, and the route is gated, never cached, and never leaks an error.
 */

import { NextRequest } from 'next/server'

const requireTextsAccess = jest.fn()
const readCampaignProgress = jest.fn()
const listCampaignsView = jest.fn()
const readSenderSummary = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }))
jest.mock('@/lib/texts/gate', () => ({ requireTextsAccess: (...args: unknown[]) => requireTextsAccess(...args) }))
jest.mock('@/lib/texts/server/campaign-reads', () => ({
  readCampaignProgress: (...args: unknown[]) => readCampaignProgress(...args),
  listCampaignsView: (...args: unknown[]) => listCampaignsView(...args),
}))
jest.mock('@/lib/texts/server/sender-summary', () => ({
  readSenderSummary: (...args: unknown[]) => readSenderSummary(...args),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const NOW = new Date('2026-10-14T02:00:00Z')
const SENDER = {
  heroState: 'offline', primary: null, phones: [], maxPhones: 5, waiting: 4, sentToday: 0, dailyLimit: 100,
  isQuietNow: false, quietUntil: null, allOutBy: null, sending: null, now: NOW.toISOString(),
}
const run = { runId: 'r1', sent: 1, notSent: 0, waiting: 3, total: 4, finishAt: null, isQuietNow: false, isWaitingForPhone: true }

/** A query builder that answers every terminal call with `result`. */
function query(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const key of ['select', 'eq', 'order', 'limit']) chain[key] = () => chain
  chain.maybeSingle = async () => result
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function db(tables: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    sms_settings: { data: { review_url: null }, error: null },
    sms_automations: { count: 1, error: null },
    sms_campaign_runs: { data: [], error: null },
  }
  return { from: (table: string) => query(table in tables ? tables[table] : defaults[table]) }
}

beforeEach(() => {
  jest.clearAllMocks()
  readSenderSummary.mockResolvedValue(SENDER)
  readCampaignProgress.mockResolvedValue({ c1: run })
  listCampaignsView.mockResolvedValue([])
})

describe('readTextsLive', () => {
  it('reads progress once and hands it to the hero', async () => {
    const { readTextsLive } = await import('@/lib/texts/server/live')
    const live = await readTextsLive(db() as never, TENANT, NOW)
    expect(readCampaignProgress).toHaveBeenCalledTimes(1)
    expect(readSenderSummary).toHaveBeenCalledWith(expect.anything(), TENANT, NOW, { progress: { c1: run } })
    expect(live.progress).toEqual({ c1: run })
    expect(live.attention.map((item) => item.kind)).toEqual(['waiting_no_phone', 'review_link_missing'])
  })

  it('keeps the phone state and other rows when campaign reads fail', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    readCampaignProgress.mockRejectedValue(new Error('column delivery does not exist'))
    listCampaignsView.mockRejectedValue(new Error('boom'))
    const { readTextsLive } = await import('@/lib/texts/server/live')
    const live = await readTextsLive(db({ sms_campaign_runs: { data: null, error: { message: 'nope' } } }) as never, TENANT, NOW)
    expect(live.sender).toBe(SENDER)
    expect(live.progress).toEqual({})
    expect(live.attention[0].kind).toBe('waiting_no_phone')
    errorSpy.mockRestore()
  })

  it('uses the campaign list the page already read', async () => {
    const { readTextsLive } = await import('@/lib/texts/server/live')
    const campaigns = [{ id: 'c9', name: 'Promo', status: 'paused', displayState: 'paused', pauseReason: 'missed_no_phone', nextSendAt: null }]
    const live = await readTextsLive(db() as never, TENANT, NOW, { campaigns: Promise.resolve(campaigns as never) })
    expect(listCampaignsView).not.toHaveBeenCalled()
    expect(live.attention.some((item) => item.id === 'campaign_paused_itself:c9')).toBe(true)
  })
})

describe('readEmptyAudienceIds', () => {
  it('flags a campaign only when its LATEST server run found no one', async () => {
    const { readEmptyAudienceIds } = await import('@/lib/texts/server/live')
    const runs = [
      { campaign_id: 'a', planned_count: 0 }, { campaign_id: 'b', planned_count: 12 },
      { campaign_id: 'b', planned_count: 0 }, { campaign_id: 'a', planned_count: 5 },
    ]
    expect(await readEmptyAudienceIds(db({ sms_campaign_runs: { data: runs, error: null } }) as never, TENANT)).toEqual(['a'])
  })
})

describe('readReviewLinkMissing', () => {
  it('is true only when review request is on and there is no link', async () => {
    const { readReviewLinkMissing } = await import('@/lib/texts/server/live')
    expect(await readReviewLinkMissing(db() as never, TENANT)).toBe(true)
    expect(await readReviewLinkMissing(db({ sms_settings: { data: { review_url: 'https://g.page/r/x' }, error: null } }) as never, TENANT)).toBe(false)
    expect(await readReviewLinkMissing(db({ sms_automations: { count: 0, error: null } }) as never, TENANT)).toBe(false)
  })
})

describe('GET /api/admin/texts/live', () => {
  const get = async (query: string) => {
    const { GET } = await import('@/app/api/admin/texts/live/route')
    return GET(new NextRequest(`https://example.com/api/admin/texts/live${query}`))
  }

  it('is 400 without a valid tenant, before the gate', async () => {
    expect((await get('?tenantId=shop')).status).toBe(400)
    expect(requireTextsAccess).not.toHaveBeenCalled()
  })

  it('is 403 when the gate refuses', async () => {
    requireTextsAccess.mockRejectedValue(new Error('Unauthorized: Texts are for the whole store'))
    const response = await get(`?tenantId=${TENANT}`)
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(readSenderSummary).not.toHaveBeenCalled()
  })

  it('answers the live view, never cached, gated as a read', async () => {
    requireTextsAccess.mockResolvedValue({ userId: 'u1', isOwner: true })
    const response = await get(`?tenantId=${TENANT.toUpperCase()}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(requireTextsAccess).toHaveBeenCalledWith(TENANT, 'view')
    expect((await response.json()).sender.heroState).toBe('offline')
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
