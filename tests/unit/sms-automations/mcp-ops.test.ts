/** @jest-environment node */
/**
 * The operator MCP's automation ops: saving validates like the merchant API
 * and NEVER switches an automation on; listing says what blocks sending.
 */

jest.mock('server-only', () => ({}))
const mockView = jest.fn()
jest.mock('@/lib/sms-automations/api/reads', () => ({ listAutomationsView: () => mockView() }))
const mockSave = jest.fn()
jest.mock('@/lib/sms-automations/api/writes', () => ({ saveAutomation: (...a: unknown[]) => mockSave(...a) }))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { user_id: 'owner-1' } }) }) }) }) }) }) }

function view(automations: unknown[] = []) {
  return {
    automations, recipes: [{ id: 'win_back', title: 'We miss you', pitch: 'p', variables: ['firstName'], defaultMessage: 'Hi {{firstName}}' }],
    settings: { reviewUrl: null }, sender: { enrolled: 0, online: false, lastSeenAt: null }, outlook: {}, loyaltyOn: false,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSave.mockResolvedValue({ ok: true, value: { id: 'a1', created: true } })
})

it('saves a new automation Off, as the AI, under the store owner', async () => {
  mockView.mockResolvedValue(view())
  const { saveSmsAutomationOp } = await import('@/lib/sms-automations/mcp-ops')
  const result = await saveSmsAutomationOp(client as never, { tenantId: TENANT, recipe: 'win_back', params: { inactiveDays: 45 } })
  expect(result).toMatchObject({ created: true, status: 'off' })
  const [, tenantId, actorId, draft, source] = mockSave.mock.calls[0]
  expect([tenantId, actorId, source]).toEqual([TENANT, 'owner-1', 'ai'])
  expect(draft).toMatchObject({ recipe: 'win_back', params: { inactiveDays: 45 } })
  expect(draft).not.toHaveProperty('status')
})

it('refuses a message the recipe cannot fill', async () => {
  mockView.mockResolvedValue(view())
  const { saveSmsAutomationOp } = await import('@/lib/sms-automations/mcp-ops')
  await expect(saveSmsAutomationOp(client as never, { tenantId: TENANT, recipe: 'win_back', message_template: 'Your {{rewardName}}' }))
    .rejects.toThrow(/rewardName/)
  expect(mockSave).not.toHaveBeenCalled()
})

it('lists what blocks sending', async () => {
  mockView.mockResolvedValue(view())
  const { listSmsAutomationsOp } = await import('@/lib/sms-automations/mcp-ops')
  const result = await listSmsAutomationsOp(client as never, TENANT)
  expect(result.not_set_up[0]).toMatchObject({ recipe: 'win_back', placeholders: ['firstName'] })
  expect(result.blockers).toHaveLength(3)
})
