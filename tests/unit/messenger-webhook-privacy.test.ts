/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhook/route'
import { sendMessage } from '@/lib/facebook-api'
import { createClient } from '@/lib/supabase/server'
import { getActivePageByPageId } from '@/lib/facebook/page-tokens'

jest.mock('@/lib/facebook-api', () => ({
  verifyWebhookSignature: jest.fn(() => true),
  sendMessage: jest.fn(async () => true),
  sendMenuCard: jest.fn(async () => true),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getActivePageByPageId: jest.fn(), getActivePageById: jest.fn() }))

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
    expect(response.status).toBe(200)
    expect(from).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  } finally {
    if (previous === undefined) delete process.env.FACEBOOK_APP_SECRET
    else process.env.FACEBOOK_APP_SECRET = previous
  }
})
