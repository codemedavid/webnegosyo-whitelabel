/** @jest-environment node */
/**
 * LIVE end-to-end check of the owner assistant: the real chat route, the real
 * model (OpenRouter) and the real tools against the real platform database.
 * Only access is stubbed (no browser session). Conversations and PENDING
 * proposals are written for real and deleted afterwards; nothing is confirmed,
 * so the store's menu is never changed.
 *
 * Opt-in, costs a few cents of tokens:
 *   ASSISTANT_LIVE=1 ASSISTANT_LIVE_TENANT=<uuid> ASSISTANT_LIVE_USER=<owner auth uuid> npx jest --config jest.config.cjs tests/live/assistant-live.test.ts
 */
import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'

const isLive = process.env.ASSISTANT_LIVE === '1'
const TENANT = process.env.ASSISTANT_LIVE_TENANT ?? ''

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  const file = path.join(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))
// Cookie-session reads run as the service role here (no browser session).
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => jest.requireActual('@/lib/supabase/admin').createAdminClient(),
}))
jest.mock('@/lib/assistant/access', () => ({
  resolveAssistantAccess: async () => ({
    ok: true,
    caller: { userId: process.env.ASSISTANT_LIVE_USER, role: 'admin', is_owner: true, permissions: null },
    store: { id: process.env.ASSISTANT_LIVE_TENANT, slug: 'live', name: 'Live test store' },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true },
  }),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSec: 0 }) }))

const USER = process.env.ASSISTANT_LIVE_USER ?? ''

const QUESTIONS = [
  'How were sales in the last 30 days, and when am I busiest?',
  'Which dishes are not selling, and what do people order together?',
  'Who are my best customers, how is my staff doing this week, and what stock is low?',
  'Make a combo of my two dishes that are most often ordered together.',
  'Add a new dish called Garlic Butter Crab for 349 in the same category as Buttered Shrimp.',
  'Can I afford 20% off my best seller?',
  'Suggest a promo to fill my quiet hours.',
  'Draft an SMS to win back my slipping regulars for next Monday.',
  'Create a voucher SAVE10: 10% off orders over 300, one use per customer, starting tomorrow.',
]
/** Run a subset: ASSISTANT_LIVE_ONLY=6,7 (1-based). */
const ONLY = (process.env.ASSISTANT_LIVE_ONLY ?? '').split(',').map(Number).filter(Boolean)
const SELECTED = ONLY.length > 0 ? QUESTIONS.filter((_, index) => ONLY.includes(index + 1)) : QUESTIONS

const maybe = isLive && TENANT && USER ? describe : describe.skip

maybe('assistant live (real model + platform DB)', () => {
  jest.setTimeout(150_000)

  const conversations: string[] = []

  afterAll(async () => {
    // Remove only what this run created: its conversations (messages cascade) and their proposals.
    const { createAdminClient } = jest.requireActual('@/lib/supabase/admin')
    const admin = createAdminClient()
    if (conversations.length === 0) return
    await admin.from('assistant_actions').delete().in('conversation_id', conversations).eq('status', 'pending')
    await admin.from('assistant_conversations').delete().in('id', conversations)
  })

  test.each(SELECTED)('%s', async (question) => {
    const { POST } = await import('@/app/api/assistant/chat/route')
    const { loadMessages } = await import('@/lib/assistant/store')

    const response = await POST(
      new NextRequest('https://example.test/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ tenantId: TENANT, conversationId: null, message: { id: `q-${Date.now()}`, text: question } }),
      }),
    )
    const stream = await response.text()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const conversationId = /"conversationId":"([0-9a-f-]{36})"/.exec(stream)?.[1]
    if (conversationId) conversations.push(conversationId)

    const messages = conversationId ? await loadMessages(conversationId, 10) : []
    const answer = messages.find((m) => m.role === 'assistant')
    const tools = (answer?.parts ?? []).filter((p) => p.type.startsWith('tool-')) as Array<{ type: string; state?: string; output?: { facts?: unknown; card?: { type?: string; title?: string; lines?: unknown } } }>
    const text = (answer?.parts ?? []).filter((p) => p.type === 'text').map((p) => String(p.text)).join(' ')
    // Printed for the human running this check.
    process.stdout.write(
      `\nQ: ${question}\nTOOLS: ${tools.map((t) => `${t.type.slice(5)}[${t.state}] ${JSON.stringify(t.output?.facts).slice(0, 240)}${t.output?.card?.type === 'confirm' ? ` CARD=${JSON.stringify(t.output.card.lines)}` : ''}`).join('\n       ')}\nA: ${text}\n`,
    )

    expect(response.status).toBe(200)
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.every((t) => t.state === 'output-available')).toBe(true)
    expect(text.length).toBeGreaterThan(0)
  })
})
