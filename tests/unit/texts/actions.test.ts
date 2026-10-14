/** @jest-environment node */
/**
 * The Texts Server Actions' door. Every action: gate (customers + store-wide)
 * → zod → service role → server module → ActionResult; the page is
 * revalidated only after a write that changes a list; disconnecting a phone
 * is the owner's; a thrown error never leaks; `automationsAction` speaks the
 * app route's exact request and answer.
 */

// A module (not a script), so these test-file constants stay file-scoped.
export {}

const requireTextsAccess = jest.fn()
const revalidatePath = jest.fn()
const checkRateLimit = jest.fn()
const saveCampaignDraft = jest.fn()
const pauseCampaign = jest.fn()
const sendCampaignNow = jest.fn()
const getCampaignReport = jest.fn()
const previewCampaignAudience = jest.fn()
const writeCampaignMessages = jest.fn()
const disconnectPhone = jest.fn()
const renamePhone = jest.fn()
const dispatchAutomationRequest = jest.fn()
const forgetTextsLive = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimit(...args) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }))
jest.mock('@/lib/texts/gate', () => ({ requireTextsAccess: (...args: unknown[]) => requireTextsAccess(...args) }))
jest.mock('@/lib/texts/server/campaign-reads', () => ({
  getCampaignReport: (...args: unknown[]) => getCampaignReport(...args),
  previewCampaignAudience: (...args: unknown[]) => previewCampaignAudience(...args),
}))
jest.mock('@/lib/texts/server/campaign-writes', () => ({
  saveCampaignDraft: (...args: unknown[]) => saveCampaignDraft(...args),
  pauseCampaign: (...args: unknown[]) => pauseCampaign(...args),
  sendCampaignNow: (...args: unknown[]) => sendCampaignNow(...args),
  writeCampaignMessages: (...args: unknown[]) => writeCampaignMessages(...args),
  scheduleCampaign: jest.fn(), resumeCampaign: jest.fn(), archiveCampaign: jest.fn(), unarchiveCampaign: jest.fn(),
  deleteCampaignDraft: jest.fn(), switchToAutomatic: jest.fn(), duplicateCampaign: jest.fn(),
}))
jest.mock('@/lib/texts/server/phones', () => ({
  MAX_PHONE_LABEL: 40,
  disconnectPhone: (...args: unknown[]) => disconnectPhone(...args),
  renamePhone: (...args: unknown[]) => renamePhone(...args),
}))
jest.mock('@/lib/texts/server/live', () => ({ forgetTextsLive: (...args: unknown[]) => forgetTextsLive(...args) }))
jest.mock('@/lib/sms-automations/api/http', () => ({
  dispatchAutomationRequest: (...args: unknown[]) => dispatchAutomationRequest(...args),
}))

const TENANT = '0DD96B60-5232-4C79-922B-0BD9022D12BA'
const TENANT_ID = TENANT.toLowerCase()
const CAMPAIGN = '1f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d11'
const DEVICE = '2f6e1c3a-8a0e-4c62-9a53-4c3c0f1e2d12'
const DRAFT = {
  name: 'Weekend reminder',
  messageTemplate: 'Hi {{firstName}}! See you this weekend.',
  audience: { lastOrderWithinDays: 30 },
  schedule: { kind: 'one_off', time: '10:00', date: '2026-10-17', intervalDays: null, weekdays: [], endsOn: null },
}

const actions = () => import('@/app/actions/texts')

beforeEach(() => {
  jest.clearAllMocks()
  requireTextsAccess.mockResolvedValue({ userId: 'user-1', isOwner: false })
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 1 })
})

describe('the gate', () => {
  it('refuses a malformed tenant before anything else', async () => {
    const { pauseCampaignAction } = await actions()
    expect(await pauseCampaignAction('shop', CAMPAIGN)).toEqual({ ok: false, error: 'That request is not valid.', code: 'invalid_request' })
    expect(requireTextsAccess).not.toHaveBeenCalled()
  })

  it('refuses a caller the gate refuses (no permission, branch account) without touching data', async () => {
    requireTextsAccess.mockRejectedValue(new Error('Unauthorized: Texts are for the whole store'))
    const { pauseCampaignAction } = await actions()
    expect(await pauseCampaignAction(TENANT, CAMPAIGN)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(pauseCampaign).not.toHaveBeenCalled()
  })

  it('checks the gate with the lower-cased tenant, edit for writes and view for reads', async () => {
    pauseCampaign.mockResolvedValue({ ok: true, value: null })
    getCampaignReport.mockResolvedValue({ runs: [] })
    const { pauseCampaignAction, getCampaignReportAction } = await actions()
    await pauseCampaignAction(TENANT, CAMPAIGN)
    await getCampaignReportAction(TENANT, CAMPAIGN)
    expect(requireTextsAccess.mock.calls).toEqual([[TENANT_ID, 'edit'], [TENANT_ID, 'view']])
  })

  it('refuses bad input after the gate, with the schema message', async () => {
    const { saveCampaignAction, pauseCampaignAction } = await actions()
    expect(await saveCampaignAction(TENANT, { ...DRAFT, name: '' })).toMatchObject({ ok: false, code: 'invalid' })
    expect(await pauseCampaignAction(TENANT, 'not-a-uuid')).toMatchObject({ ok: false, code: 'invalid' })
    expect(saveCampaignDraft).not.toHaveBeenCalled()
  })

  it('turns a thrown error into a friendly refusal without leaking it', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    pauseCampaign.mockRejectedValue(new Error('relation "secret" does not exist'))
    const { pauseCampaignAction } = await actions()
    const result = await pauseCampaignAction(TENANT, CAMPAIGN)
    expect(result).toEqual({ ok: false, error: 'Something went wrong. Try again.', code: 'unavailable' })
    expect(revalidatePath).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('campaign actions', () => {
  it('saves a draft as the signed-in person and revalidates the page', async () => {
    saveCampaignDraft.mockResolvedValue({ ok: true, value: { id: CAMPAIGN } })
    const { saveCampaignAction } = await actions()
    expect(await saveCampaignAction(TENANT, DRAFT)).toEqual({ ok: true, value: { id: CAMPAIGN } })
    expect(saveCampaignDraft).toHaveBeenCalledWith({ fake: true }, TENANT_ID, 'user-1', expect.objectContaining({ name: 'Weekend reminder' }))
    expect(revalidatePath).toHaveBeenCalledWith('/[tenant]/admin/texts', 'page')
  })

  it('passes a refusal through without revalidating', async () => {
    sendCampaignNow.mockResolvedValue({ ok: false, status: 409, error: 'It is already sending.', code: 'already_sending' })
    const { sendCampaignNowAction } = await actions()
    expect(await sendCampaignNowAction(TENANT, CAMPAIGN)).toEqual({ ok: false, error: 'It is already sending.', code: 'already_sending' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('reads a report page by cursor and says when the campaign is gone', async () => {
    getCampaignReport.mockResolvedValueOnce({ runs: [] }).mockResolvedValueOnce(null)
    const { getCampaignReportAction } = await actions()
    expect(await getCampaignReportAction(TENANT, CAMPAIGN, 'cursor-1')).toEqual({ ok: true, value: { runs: [] } })
    expect(getCampaignReport.mock.calls[0].slice(1, 4)).toEqual([TENANT_ID, CAMPAIGN, 'cursor-1'])
    expect(await getCampaignReportAction(TENANT, CAMPAIGN)).toMatchObject({ ok: false, code: 'not_found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('limits previews per person across instances, failing open', async () => {
    previewCampaignAudience.mockResolvedValue({ reach: 1 })
    const { previewCampaignAudienceAction } = await actions()
    await previewCampaignAudienceAction(TENANT, { audience: {}, messageTemplate: 'Hi' })
    expect(checkRateLimit).toHaveBeenCalledWith('texts-preview:user-1', { limit: 30, windowSec: 60, onRedisFailure: 'open' })
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
    expect(await previewCampaignAudienceAction(TENANT, { audience: {}, messageTemplate: 'Hi' })).toMatchObject({ code: 'rate_limited' })
    expect(previewCampaignAudience).toHaveBeenCalledTimes(1)
  })

  it('limits "Write it for me" per person and per store per day, refusing when the limiter is down', async () => {
    writeCampaignMessages.mockResolvedValue({ ok: true, value: { messages: ['Hi'] } })
    const { writeCampaignMessagesAction } = await actions()
    const request = { name: 'Promo', audiencePreset: 'lapsed', language: 'tl' }
    expect(await writeCampaignMessagesAction(TENANT, request)).toEqual({ ok: true, value: { messages: ['Hi'] } })
    expect(checkRateLimit.mock.calls).toEqual([
      ['texts-write:user-1', { limit: 6, windowSec: 60, onRedisFailure: 'refuse' }],
      [`texts-write-day:${TENANT_ID}`, { limit: 60, windowSec: 86_400, onRedisFailure: 'refuse' }],
    ])
    checkRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSec: 1 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 999 })
    expect(await writeCampaignMessagesAction(TENANT, request)).toMatchObject({ ok: false, code: 'rate_limited', error: expect.stringMatching(/today/) })
    expect(writeCampaignMessages).toHaveBeenCalledTimes(1)
  })

  it('previews without revalidating', async () => {
    previewCampaignAudience.mockResolvedValue({ reach: 3 })
    const { previewCampaignAudienceAction } = await actions()
    expect(await previewCampaignAudienceAction(TENANT, { audience: { minOrderCount: 2 }, messageTemplate: 'Hi' })).toEqual({ ok: true, value: { reach: 3 } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('the live view after a change', () => {
  it('drops the cached live view after a successful change, not after a read or a refusal', async () => {
    pauseCampaign.mockResolvedValueOnce({ ok: true, value: null })
      .mockResolvedValueOnce({ ok: false, status: 409, error: 'No.', code: 'x' })
    renamePhone.mockResolvedValue({ ok: true, value: null })
    getCampaignReport.mockResolvedValue({ runs: [] })
    const { pauseCampaignAction, renamePhoneAction, getCampaignReportAction } = await actions()
    await pauseCampaignAction(TENANT, CAMPAIGN)
    await renamePhoneAction(TENANT, DEVICE, 'Front')
    expect(forgetTextsLive.mock.calls).toEqual([[TENANT_ID], [TENANT_ID]])
    await pauseCampaignAction(TENANT, CAMPAIGN)
    await getCampaignReportAction(TENANT, CAMPAIGN)
    expect(forgetTextsLive).toHaveBeenCalledTimes(2)
  })
})

describe('phone actions', () => {
  it('lets anyone with access rename a phone', async () => {
    renamePhone.mockResolvedValue({ ok: true, value: null })
    const { renamePhoneAction } = await actions()
    expect(await renamePhoneAction(TENANT, DEVICE.toUpperCase(), ' Front counter ')).toEqual({ ok: true, value: null })
    expect(renamePhone).toHaveBeenCalledWith({ fake: true }, TENANT_ID, DEVICE, 'Front counter')
  })

  it('lets only the owner disconnect a phone', async () => {
    const { disconnectPhoneAction } = await actions()
    expect(await disconnectPhoneAction(TENANT, DEVICE)).toEqual({ ok: false, error: 'Only the owner can disconnect a phone.', code: 'owner_only' })
    expect(disconnectPhone).not.toHaveBeenCalled()
    requireTextsAccess.mockResolvedValue({ userId: 'owner-1', isOwner: true })
    disconnectPhone.mockResolvedValue({ ok: true, value: null })
    expect(await disconnectPhoneAction(TENANT, DEVICE)).toEqual({ ok: true, value: null })
    expect(disconnectPhone).toHaveBeenCalledWith({ fake: true }, TENANT_ID, 'owner-1', DEVICE)
  })
})

describe('automationsAction', () => {
  it('runs the app route\'s request for this store and returns its answer', async () => {
    dispatchAutomationRequest.mockResolvedValue({ ok: true, value: { automations: [] } })
    const { automationsAction } = await actions()
    expect(await automationsAction(TENANT, { action: 'list' })).toEqual({ ok: true, value: { automations: [] } })
    expect(dispatchAutomationRequest).toHaveBeenCalledWith({ fake: true }, { action: 'list', tenantId: TENANT_ID }, { actorId: 'user-1' })
    expect(requireTextsAccess).toHaveBeenCalledWith(TENANT_ID, 'view')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('cannot be pointed at another store', async () => {
    dispatchAutomationRequest.mockResolvedValue({ ok: true, value: {} })
    const { automationsAction } = await actions()
    await automationsAction(TENANT, { action: 'cancel_waiting', tenantId: '11111111-1111-4111-8111-111111111111' })
    expect(dispatchAutomationRequest.mock.calls[0][1].tenantId).toBe(TENANT_ID)
    expect(revalidatePath).toHaveBeenCalledWith('/[tenant]/admin/texts', 'page')
  })

  it('meters automation "Write it for me" and previews with the same shared limits', async () => {
    dispatchAutomationRequest.mockResolvedValue({ ok: true, value: { messages: [] } })
    const { automationsAction } = await actions()
    await automationsAction(TENANT, { action: 'write', recipe: 'win_back', language: 'en' })
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toEqual(['texts-write:user-1', `texts-write-day:${TENANT_ID}`])
    checkRateLimit.mockClear()
    await automationsAction(TENANT, { action: 'preview', automation: { recipe: 'win_back', messageTemplate: 'Hi' } })
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toEqual(['texts-preview:user-1'])
    checkRateLimit.mockClear()
    await automationsAction(TENANT, { action: 'list' })
    expect(checkRateLimit).not.toHaveBeenCalled()
  })

  it('masks guest names in the activity feed ("Maria S."), keeping unknown names unknown', async () => {
    dispatchAutomationRequest.mockResolvedValue({ ok: true, value: { items: [
      { id: 'a', guestName: 'Maria Santos Reyes', phoneLast4: '4567' },
      { id: 'b', guestName: null, phoneLast4: '1111' },
      { id: 'c', guestName: 'Ana', phoneLast4: '2222' },
    ], nextCursor: null } })
    const { automationsAction } = await actions()
    const result = await automationsAction(TENANT, { action: 'activity', includeCampaigns: true })
    expect(result).toEqual({ ok: true, value: { items: [
      { id: 'a', guestName: 'Maria R.', phoneLast4: '4567' },
      { id: 'b', guestName: null, phoneLast4: '1111' },
      { id: 'c', guestName: 'Ana', phoneLast4: '2222' },
    ], nextCursor: null } })
  })

  it('refuses a request the route would refuse, and passes refusals through', async () => {
    const { automationsAction } = await actions()
    expect(await automationsAction(TENANT, { action: 'dance' })).toMatchObject({ ok: false, code: 'invalid_request' })
    expect(await automationsAction(TENANT, 'list')).toMatchObject({ ok: false, code: 'invalid' })
    dispatchAutomationRequest.mockResolvedValue({ ok: false, status: 409, error: 'Add your review link in Texting rules first.', code: 'missing_review_link' })
    expect(await automationsAction(TENANT, { action: 'run_now', automationId: CAMPAIGN })).toEqual({
      ok: false, error: 'Add your review link in Texting rules first.', code: 'missing_review_link',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
