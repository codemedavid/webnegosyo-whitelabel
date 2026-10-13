/** @jest-environment node */
/**
 * Owl's SMS automation tools. A proposal is filed only when the API's own
 * rules accept it (message words, review link, loyalty, a sending phone), a
 * new automation is always saved Off, and the cards that text real guests
 * say how many.
 */
import { createRefBook } from '@/lib/assistant/refs'
import { getRecipe } from '@/lib/sms-automations/recipes'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
const mockCreatePending = jest.fn()
jest.mock('@/lib/assistant/actions/store', () => ({ createPendingAction: (...a: unknown[]) => mockCreatePending(...a) }))
const mockView = jest.fn()
jest.mock('@/lib/sms-automations/api/reads', () => ({ listAutomationsView: () => mockView() }))
const mockPreview = jest.fn()
jest.mock('@/lib/sms-automations/api/writes', () => ({ previewAutomation: (...a: unknown[]) => mockPreview(...a) }))

const AUTOMATION = '00000000-0000-4000-8000-0000000000a1'

function view(overrides: Record<string, unknown> = {}) {
  return {
    automations: [],
    recipes: [{ id: 'win_back', title: 'We miss you', pitch: 'Bring them back' }],
    settings: { reviewUrl: null },
    sender: { enrolled: 1, online: true, lastSeenAt: null },
    outlook: { waiting: 0, sentToday: 0, dailyLimit: 100, finishAt: null },
    loyaltyOn: false,
    ...overrides,
  }
}

const winBack = {
  id: AUTOMATION, recipe: 'win_back', name: 'We miss you', description: 'Text guests who haven’t ordered in 30 days',
  params: { inactiveDays: 30 }, messageTemplate: getRecipe('win_back').defaultMessage, runMode: 'auto', reentryDays: null,
  status: 'off', source: 'owner', updatedAt: '', stats: { waiting: 0, sent30d: 0, skipped30d: 0, lastSentAt: null },
}

function ctx() {
  return {
    tenantId: 't', tenantSlug: 's', conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: true, permissions: null },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
    refs: createRefBook({}), photos: [],
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

async function tools() {
  return import('@/lib/assistant/tools/propose/automation')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreatePending.mockResolvedValue({ id: 'act1', expiresAt: '2026-10-13T05:00:00Z' })
  mockView.mockResolvedValue(view())
  mockPreview.mockResolvedValue({ now: { queued: 12 } })
})

describe('propose_sms_automation', () => {
  it('files a new automation, Off, with the default Taglish message when asked', async () => {
    const { proposeSmsAutomationTool } = await tools()
    const result = await proposeSmsAutomationTool.run(ctx() as never, { recipe: 'win_back', language: 'tl', inactiveDays: 45 })
    expect(result.facts).toMatchObject({ proposed: true })
    const filed = mockCreatePending.mock.calls[0][0]
    expect(filed.kind).toBe('sms_automation')
    expect(filed.payload.draft).toMatchObject({ recipe: 'win_back', params: { inactiveDays: 45 }, messageTemplate: getRecipe('win_back').defaultMessageTl })
    expect(JSON.stringify(result.card)).toContain('Saved Off')
  })

  it('refuses a message with words the recipe cannot fill, filing nothing', async () => {
    const { proposeSmsAutomationTool } = await tools()
    const result = await proposeSmsAutomationTool.run(ctx() as never, { recipe: 'win_back', message: 'Your {{rewardName}}!' })
    expect(result.facts).toMatchObject({ proposed: false })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  it('edits keep the current message and warn when the automation is live', async () => {
    mockView.mockResolvedValue(view({ automations: [{ ...winBack, status: 'on', messageTemplate: 'Hi {{firstName}}!' }] }))
    const { proposeSmsAutomationTool } = await tools()
    const result = await proposeSmsAutomationTool.run(ctx() as never, { recipe: 'win_back', inactiveDays: 60 })
    expect(mockCreatePending.mock.calls[0][0].payload.draft).toMatchObject({ messageTemplate: 'Hi {{firstName}}!', params: { inactiveDays: 60 } })
    expect(JSON.stringify(result.card)).toContain('This automation is On')
  })
})

describe('propose_sms_automation_status', () => {
  it('says how many guests a backlog send would text', async () => {
    mockView.mockResolvedValue(view({ automations: [winBack] }))
    const { proposeSmsAutomationStatusTool } = await tools()
    const result = await proposeSmsAutomationStatusTool.run(ctx() as never, { recipe: 'win_back', status: 'on', sendBacklog: true })
    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({ kind: 'sms_automation_status', payload: { automationId: AUTOMATION, status: 'on', sendBacklog: true } })
    expect(JSON.stringify(result.card)).toContain('12 guests')
  })

  it('refuses what cannot run: not set up, no review link, loyalty off', async () => {
    const { proposeSmsAutomationStatusTool } = await tools()
    expect((await proposeSmsAutomationStatusTool.run(ctx() as never, { recipe: 'win_back', status: 'on' })).facts).toMatchObject({ proposed: false })
    mockView.mockResolvedValue(view({ automations: [{ ...winBack, recipe: 'review_request' }] }))
    expect((await proposeSmsAutomationStatusTool.run(ctx() as never, { recipe: 'review_request', status: 'on' })).facts)
      .toMatchObject({ proposed: false, reason: expect.stringContaining('review link') })
    mockView.mockResolvedValue(view({ automations: [{ ...winBack, recipe: 'loyalty_reward_waiting' }] }))
    expect((await proposeSmsAutomationStatusTool.run(ctx() as never, { recipe: 'loyalty_reward_waiting', status: 'on' })).facts)
      .toMatchObject({ proposed: false, reason: expect.stringContaining('Loyalty is off') })
    expect(mockCreatePending).not.toHaveBeenCalled()
  })
})

describe('propose_run_sms_automation', () => {
  it('needs a sending phone and someone to text', async () => {
    const { proposeRunSmsAutomationTool } = await tools()
    mockView.mockResolvedValue(view({ automations: [winBack], sender: { enrolled: 0, online: false, lastSeenAt: null } }))
    expect((await proposeRunSmsAutomationTool.run(ctx() as never, { recipe: 'win_back' })).facts).toMatchObject({ proposed: false })
    mockView.mockResolvedValue(view({ automations: [winBack] }))
    mockPreview.mockResolvedValue({ now: { queued: 0 } })
    expect((await proposeRunSmsAutomationTool.run(ctx() as never, { recipe: 'win_back' })).facts).toMatchObject({ proposed: false })
    mockPreview.mockResolvedValue({ now: { queued: 3 } })
    const result = await proposeRunSmsAutomationTool.run(ctx() as never, { recipe: 'win_back' })
    expect(mockCreatePending.mock.calls[0][0]).toMatchObject({ kind: 'sms_automation_run', summary: 'Text 3 guests now for "We miss you"' })
    expect(JSON.stringify(result.card)).toContain('3 guests')
  })
})
