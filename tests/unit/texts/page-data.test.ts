/** @jest-environment node */
/**
 * First paint of /admin/texts: one parallel read; the live part reuses the
 * campaign list instead of reading it twice; a failed list read reaches the
 * page's error boundary rather than rendering an empty page as if it were true.
 */

// A module (not a script), so these test-file constants stay file-scoped.
export {}

const listCampaignsView = jest.fn()
const readThirtyDayLine = jest.fn()
const listAutomationsView = jest.fn()
const readTextsLive = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }))
jest.mock('@/lib/texts/server/campaign-reads', () => ({
  listCampaignsView: (...args: unknown[]) => listCampaignsView(...args),
  readThirtyDayLine: (...args: unknown[]) => readThirtyDayLine(...args),
}))
jest.mock('@/lib/sms-automations/api/reads', () => ({
  listAutomationsView: (...args: unknown[]) => listAutomationsView(...args),
}))
jest.mock('@/lib/texts/server/live', () => ({ readTextsLive: (...args: unknown[]) => readTextsLive(...args) }))

const TENANT = { id: 't-1', slug: 'shop', name: 'Shop' }
const NOW = new Date('2026-10-14T02:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  listCampaignsView.mockResolvedValue([{ id: 'c1' }])
  readThirtyDayLine.mockResolvedValue({ sent: 10, cameBack: 2, sales: 500 })
  listAutomationsView.mockResolvedValue({ automations: [], settings: { optOutLine: 'Reply STOP to stop' } })
  readTextsLive.mockResolvedValue({ sender: {}, attention: [], progress: {} })
})

describe('loadTextsPage', () => {
  it('assembles the page; the live part reads on its own, never the campaign list again', async () => {
    const { loadTextsPage } = await import('@/lib/texts/server/page-data')
    const page = await loadTextsPage(TENANT, { userId: 'u1', isOwner: true }, NOW)
    expect(page).toMatchObject({
      tenantId: 't-1', tenantSlug: 'shop', storeName: 'Shop', isOwner: true, isDemo: false,
      campaigns: [{ id: 'c1' }], thirtyDays: { sent: 10, cameBack: 2, sales: 500 }, optOutLine: 'Reply STOP to stop',
    })
    expect(listCampaignsView).toHaveBeenCalledTimes(1)
    expect(readTextsLive).toHaveBeenCalledWith({ fake: true }, 't-1', NOW)
  })

  it('throws when the campaign list cannot be read', async () => {
    listCampaignsView.mockRejectedValue(new Error('boom'))
    const { loadTextsPage } = await import('@/lib/texts/server/page-data')
    await expect(loadTextsPage(TENANT, { userId: 'u1', isOwner: false }, NOW)).rejects.toThrow('boom')
  })
})
