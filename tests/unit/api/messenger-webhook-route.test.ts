/** @jest-environment node */
import { NextRequest } from 'next/server'

const after = jest.fn()
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (work: unknown) => after(work) }))
jest.mock('server-only', () => ({}))
const verifyWebhookSignature = jest.fn(() => true)
jest.mock('@/lib/facebook-api', () => ({ verifyWebhookSignature: (...args: unknown[]) => verifyWebhookSignature(...(args as [])) }))
const handleEvent = jest.fn()
jest.mock('@/lib/messenger/handle-event', () => ({ handleEvent: (...args: unknown[]) => handleEvent(...args) }))
jest.mock('@/lib/messenger/webhook-deps', () => ({ createWebhookDeps: () => ({}) }))

import { POST } from '@/app/api/webhook/route'

function request(body: unknown, signature: string | null = 'sha256=ok') {
  return new NextRequest('https://example.test/api/webhook', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: signature ? { 'x-hub-signature-256': signature } : {},
  })
}

const MESSAGE = {
  object: 'page',
  entry: [{ id: 'page', messaging: [
    { sender: { id: 'a' }, recipient: { id: 'page' }, timestamp: 2, message: { mid: 'm2', text: 'menu' } },
    { sender: { id: 'b' }, recipient: { id: 'page' }, timestamp: 1, message: { mid: 'm1', text: 'hi' } },
  ] }],
}

describe('POST /api/webhook', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, FACEBOOK_APP_SECRET: 'secret' }
    after.mockReset()
    handleEvent.mockReset()
    verifyWebhookSignature.mockReturnValue(true)
  })
  afterAll(() => { process.env = env })

  it('answers 200 before any work, then handles each event oldest first', async () => {
    const response = await POST(request(MESSAGE))
    expect(response.status).toBe(200)
    expect(handleEvent).not.toHaveBeenCalled()
    expect(after).toHaveBeenCalledTimes(1)

    await after.mock.calls[0][0]()
    expect(handleEvent.mock.calls.map(([event]) => event.dedupeKey)).toEqual(['mid:m1', 'mid:m2'])
  })

  it('one failing event does not stop the next', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    handleEvent.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('replied')
    await POST(request(MESSAGE))
    await after.mock.calls[0][0]()
    expect(handleEvent).toHaveBeenCalledTimes(2)
    errors.mockRestore()
  })

  it('refuses a missing or bad signature, and a missing app secret', async () => {
    expect((await POST(request(MESSAGE, null))).status).toBe(403)
    verifyWebhookSignature.mockReturnValue(false)
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(request(MESSAGE))).status).toBe(403)
    delete process.env.FACEBOOK_APP_SECRET
    expect((await POST(request(MESSAGE))).status).toBe(500)
    errors.mockRestore()
    expect(after).not.toHaveBeenCalled()
  })

  it('404 for non-page objects, 400 for broken JSON, 200 with nothing to do', async () => {
    expect((await POST(request({ object: 'instagram', entry: [] }))).status).toBe(404)
    expect((await POST(request('{nope'))).status).toBe(400)
    expect((await POST(request({ object: 'page', entry: [] }))).status).toBe(200)
    expect(after).not.toHaveBeenCalled()
  })
})
