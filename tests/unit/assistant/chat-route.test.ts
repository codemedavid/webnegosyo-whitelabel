/** @jest-environment node */
/**
 * The chat route end to end with a scripted model: refusals happen before any
 * streaming, the browser's history is never trusted, and the card a tool
 * renders reaches the browser but never the model.
 */
import { NextRequest } from 'next/server'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { z } from 'zod'

jest.mock('server-only', () => ({}))

const mockAccess = jest.fn()
jest.mock('@/lib/assistant/access', () => ({ resolveAssistantAccess: (...args: unknown[]) => mockAccess(...args) }))

const mockRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))

const mockStore = {
  claimAssistantTurn: jest.fn(),
  openConversation: jest.fn(),
  loadMessages: jest.fn(),
  saveMessage: jest.fn(),
  saveRefMap: jest.fn(),
  recordAssistantUsage: jest.fn(),
}
jest.mock('@/lib/assistant/store', () => ({
  claimAssistantTurn: (...a: unknown[]) => mockStore.claimAssistantTurn(...a),
  openConversation: (...a: unknown[]) => mockStore.openConversation(...a),
  loadMessages: (...a: unknown[]) => mockStore.loadMessages(...a),
  saveMessage: (...a: unknown[]) => mockStore.saveMessage(...a),
  saveRefMap: (...a: unknown[]) => mockStore.saveRefMap(...a),
  recordAssistantUsage: (...a: unknown[]) => mockStore.recordAssistantUsage(...a),
}))

jest.mock('@/lib/assistant/actions/store', () => ({ loadActionStatuses: async () => new Map() }))

const toolRun = jest.fn()
jest.mock('@/lib/assistant/tools', () => ({
  ASSISTANT_TOOLS: [
    {
      name: 'get_sales_overview',
      description: 'sales',
      access: { permission: 'analytics' },
      input: z.object({ range: z.enum(['today', '7d']) }),
      run: (...args: unknown[]) => toolRun(...args),
    },
  ],
}))

const prompts: unknown[] = []
let mockModel: MockLanguageModelV3
jest.mock('@/lib/assistant/runtime/ai-sdk', () => ({
  ...jest.requireActual('@/lib/assistant/runtime/ai-sdk'),
  assistantModel: () => mockModel,
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const CONVERSATION = '22222222-2222-4222-8222-222222222222'
const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } }

function scriptedModel() {
  let call = 0
  return new MockLanguageModelV3({
    doStream: async (options) => {
      prompts.push(options.prompt)
      call += 1
      const chunks =
        call === 1
          ? [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-call', toolCallId: 't1', toolName: 'get_sales_overview', input: JSON.stringify({ range: '7d' }) },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, providerMetadata: { openrouter: { usage: { cost: 0.001 } } } },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'x' },
              { type: 'text-delta', id: 'x', delta: 'Sales are up.' },
              { type: 'text-end', id: 'x' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage, providerMetadata: { openrouter: { usage: { cost: 0.002 } } } },
            ]
      return { stream: convertArrayToReadableStream(chunks as never) }
    },
  })
}

function post(body: unknown) {
  return new NextRequest('https://example.test/api/assistant/chat', { method: 'POST', body: JSON.stringify(body) })
}

const validBody = { tenantId: TENANT, conversationId: null, message: { id: 'm1', text: 'How were sales this week?' } }

beforeEach(() => {
  prompts.length = 0
  mockModel = scriptedModel()
  mockAccess.mockReset().mockResolvedValue({
    ok: true,
    caller: { userId: 'u1', role: 'admin', is_owner: true, permissions: null },
    store: { id: TENANT, slug: 'seacook', name: 'SeaCook' },
    flags: { inventoryEnabled: false, customerHubOn: true, menuEngineeringEnabled: true },
  })
  mockRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 0 })
  Object.values(mockStore).forEach((fn) => fn.mockReset())
  mockStore.claimAssistantTurn.mockResolvedValue(true)
  mockStore.openConversation.mockResolvedValue({ id: CONVERSATION, refMap: {} })
  mockStore.loadMessages.mockResolvedValue([])
  toolRun.mockReset().mockResolvedValue({ facts: { salesNow: 12000 }, card: { type: 'stats', title: 'CARD-ONLY-FOR-BROWSER', items: [] } })
})

async function drain(response: Response): Promise<string> {
  const text = await response.text()
  // Let onFinish persistence settle.
  await new Promise((resolve) => setTimeout(resolve, 20))
  return text
}

describe('POST /api/assistant/chat', () => {
  test('rejects a malformed body before touching anything', async () => {
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post({ tenantId: 'nope' }))

    expect(response.status).toBe(400)
    expect(mockAccess).not.toHaveBeenCalled()
  })

  test('passes an access refusal through as a plain HTTP error', async () => {
    mockAccess.mockResolvedValue({ ok: false, status: 403, error: "The assistant isn't enabled for this store yet." })
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post(validBody))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "The assistant isn't enabled for this store yet." })
    expect(mockStore.claimAssistantTurn).not.toHaveBeenCalled()
  })

  test('an exhausted daily budget refuses before a conversation is opened', async () => {
    mockStore.claimAssistantTurn.mockResolvedValue(false)
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post(validBody))

    expect(response.status).toBe(429)
    expect(mockStore.openConversation).not.toHaveBeenCalled()
  })

  test('someone else’s conversation id reads as not found', async () => {
    mockStore.openConversation.mockResolvedValue(null)
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post({ ...validBody, conversationId: CONVERSATION }))

    expect(response.status).toBe(404)
  })

  test('the tool’s card streams to the browser but the model only ever sees its facts', async () => {
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post(validBody))
    const body = await drain(response)

    expect(response.status).toBe(200)
    expect(body).toContain('CARD-ONLY-FOR-BROWSER')
    expect(prompts).toHaveLength(2)
    const secondPrompt = JSON.stringify(prompts[1])
    expect(secondPrompt).toContain('salesNow')
    expect(secondPrompt).not.toContain('CARD-ONLY-FOR-BROWSER')
    // The tenant is injected, never a model input.
    expect(toolRun).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }), { range: '7d' })
  })

  test('history comes from storage, and the turn’s messages and cost are persisted', async () => {
    mockStore.loadMessages.mockResolvedValue([
      { id: 'old-u', role: 'user', parts: [{ type: 'text', text: 'earlier question' }] },
      { id: 'old-a', role: 'assistant', parts: [{ type: 'text', text: 'earlier answer' }] },
    ])
    const { POST } = await import('@/app/api/assistant/chat/route')

    await drain(await POST(post(validBody)))

    expect(JSON.stringify(prompts[0])).toContain('earlier answer')
    const savedRoles = mockStore.saveMessage.mock.calls.map((call) => (call[2] as { role: string }).role)
    expect(savedRoles).toEqual(['user', 'assistant'])
    expect(mockStore.recordAssistantUsage).toHaveBeenCalledWith(TENANT, 220, expect.closeTo(0.003, 6))
  })

  test('a stored card from a tool this caller has since lost never reaches the model', async () => {
    mockStore.loadMessages.mockResolvedValue([
      { id: 'old-u', role: 'user', parts: [{ type: 'text', text: 'How is my staff doing?' }] },
      {
        id: 'old-a',
        role: 'assistant',
        parts: [
          {
            type: 'tool-get_staff_activity',
            toolCallId: 'old-t1',
            state: 'output-available',
            input: { period: 'week' },
            output: {
              facts: { staff: [{ ref: 's1', name: 'Ana', posSales: 3 }] },
              card: { type: 'ranked', title: 'Staff activity', rows: [{ label: 'STORED-CARD-SECRET ana@shop.ph', value: '₱1' }] },
            },
          },
          { type: 'text', text: 'Ana rang up 3 sales.' },
        ],
      },
    ])
    const { POST } = await import('@/app/api/assistant/chat/route')

    await drain(await POST(post({ ...validBody, conversationId: CONVERSATION })))

    const firstPrompt = JSON.stringify(prompts[0])
    expect(firstPrompt).toContain('posSales')
    expect(firstPrompt).not.toContain('STORED-CARD-SECRET')
    expect(firstPrompt).not.toContain('ana@shop.ph')
  })

  test('a merchant-app bearer token stays in scope for access checks and for tool calls mid-stream', async () => {
    const { getRequestBearerToken } = await import('@/lib/supabase/bearer-session')
    const seen: Array<string | null> = []
    mockAccess.mockImplementation(async (...args: unknown[]) => {
      seen.push(getRequestBearerToken())
      return {
        ok: true,
        caller: { userId: 'u1', role: 'admin', is_owner: true, permissions: null },
        store: { id: TENANT, slug: 'seacook', name: 'SeaCook' },
        flags: { inventoryEnabled: false, customerHubOn: true, menuEngineeringEnabled: true },
        args,
      }
    })
    toolRun.mockImplementation(async () => {
      seen.push(getRequestBearerToken())
      return { facts: { salesNow: 1 } }
    })
    const { POST } = await import('@/app/api/assistant/chat/route')
    const request = new NextRequest('https://example.test/api/assistant/chat', {
      method: 'POST',
      headers: { authorization: 'Bearer app-token' },
      body: JSON.stringify(validBody),
    })

    await drain(await POST(request))

    expect(seen).toEqual(['app-token', 'app-token'])
  })
  test('menu photos reach the tool for this turn only: never the model, never storage', async () => {
    const photo = `data:image/jpeg;base64,${'A'.repeat(400)}`
    const { POST } = await import('@/app/api/assistant/chat/route')

    await drain(await POST(post({ ...validBody, message: { id: 'm1', text: 'Add these', images: [photo] } })))

    expect(toolRun.mock.calls[0][0]).toMatchObject({ photos: [photo] })
    expect(JSON.stringify(prompts)).not.toContain(photo)
    expect(JSON.stringify(prompts[0])).toContain('Attached to this message: 1 photo')
    const savedUser = mockStore.saveMessage.mock.calls[0][2] as { parts: unknown[] }
    expect(savedUser.parts).toEqual([{ type: 'text', text: 'Add these' }, { type: 'data-photos', data: { count: 1 } }])
    expect(JSON.stringify(mockStore.saveMessage.mock.calls)).not.toContain(photo)
  })

  test('a photo that is not an image is refused before the budget is touched', async () => {
    const { POST } = await import('@/app/api/assistant/chat/route')

    const response = await POST(post({ ...validBody, message: { id: 'm1', text: 'Add these', images: ['data:text/html;base64,PHNjcmlwdD4='] } }))

    expect(response.status).toBe(400)
    expect(mockStore.claimAssistantTurn).not.toHaveBeenCalled()
  })
})
