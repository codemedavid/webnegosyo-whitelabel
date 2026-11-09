/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhook/route'
import { DEFAULT_SETTINGS } from '@/lib/messenger/settings'
import { DEFAULT_RULES } from '@/lib/messenger/rules'
import { sendMessage } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import { getActivePageByPageId } from '@/lib/facebook/page-tokens'

jest.mock('@/lib/facebook-api', () => ({
  verifyWebhookSignature: jest.fn(() => true),
  sendMessage: jest.fn(async () => true),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getActivePageByPageId: jest.fn(), getActivePageById: jest.fn() }))
const pendingWork: Array<Promise<unknown>> = []
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (work: () => Promise<unknown>) => { pendingWork.push(work()) },
}))
jest.mock('server-only', () => ({}))
const sendMessages = jest.fn(async () => ({ ok: true, sent: 1 }))
jest.mock('@/lib/messenger/send', () => ({ ...jest.requireActual('@/lib/messenger/send'), sendMessages: (...args: unknown[]) => sendMessages(...(args as [])) }))
jest.mock('@/lib/messenger/dedupe', () => ({ claimEventOnce: jest.fn(async () => true) }))
jest.mock('@/lib/messenger/session', () => ({ touchSession: jest.fn(async () => null), setBotPause: jest.fn(async () => true) }))
jest.mock('@/lib/messenger/load-store', () => ({
  loadStoreBundle: jest.fn(async () => ({
    tenantId: 'tenant', slug: 's', facebookPageRowId: null, rules: DEFAULT_RULES, settings: DEFAULT_SETTINGS,
    store: { name: 'S', baseUrl: 'https://s.example', logoUrl: null, hoursText: null, address: null, categories: [], items: [] },
  })),
}))

it('does not associate an unrelated Messenger sender with a recent customer order', async () => {
  const previous = process.env.FACEBOOK_APP_SECRET
  process.env.FACEBOOK_APP_SECRET = 'test-secret'
  const from = jest.fn(() => { throw new Error('Unrelated messages must not look up orders') })
  jest.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
  jest.mocked(getActivePageByPageId).mockResolvedValue({ tenant_id: 'tenant', page_access_token: 'test-page-token' } as Awaited<ReturnType<typeof getActivePageByPageId>>)
  try {
    const response = await POST(new NextRequest('https://example.test/api/webhook', {
      method: 'POST', headers: { 'x-hub-signature-256': 'sha256=test' },
      body: JSON.stringify({ object: 'page', entry: [{ id: 'page', time: 1, messaging: [{ sender: { id: 'unrelated-person' }, recipient: { id: 'page' }, message: { text: 'hello' } }] }] }),
    }))
    await Promise.all(pendingWork.splice(0))
    expect(response.status).toBe(200)
    expect(from).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(sendMessages).not.toHaveBeenCalled()
  } finally {
    if (previous === undefined) delete process.env.FACEBOOK_APP_SECRET
    else process.env.FACEBOOK_APP_SECRET = previous
  }
})
