/** @jest-environment node */
import { sendMessage } from '@/lib/facebook-api'

const CONTROLLED_ELSEWHERE = {
  error: { message: 'another app is controlling this thread now', code: 10, error_subcode: 2018300 },
}

function graph(responses: Array<{ ok: boolean; body: unknown }>) {
  const calls: Array<{ path: string; body: unknown }> = []
  global.fetch = jest.fn(async (input: string | URL, init?: RequestInit) => {
    calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body ?? '{}')) })
    const next = responses.shift()!
    return { ok: next.ok, json: async () => next.body, text: async () => JSON.stringify(next.body) } as Response
  }) as typeof fetch
  return calls
}

describe('sendMessage thread control', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('takes the thread back and sends once when another app holds it', async () => {
    const calls = graph([
      { ok: false, body: CONTROLLED_ELSEWHERE },
      { ok: true, body: { success: true } },
      { ok: true, body: { message_id: 'm1' } },
    ])

    expect(await sendMessage('psid-1', 'page-token', 'Order summary')).toBe(true)
    expect(calls.map((c) => c.path)).toEqual([
      '/v20.0/me/messages', '/v20.0/me/take_thread_control', '/v20.0/me/messages',
    ])
    expect(calls[1].body).toEqual(expect.objectContaining({ recipient: { id: 'psid-1' } }))
  })

  it('gives up when the thread cannot be taken', async () => {
    const calls = graph([
      { ok: false, body: CONTROLLED_ELSEWHERE },
      { ok: false, body: { error: { message: 'not allowed', code: 10 } } },
    ])

    expect(await sendMessage('psid-1', 'page-token', 'Order summary')).toBe(false)
    expect(calls).toHaveLength(2)
  })

  it('does not touch thread control for any other refusal', async () => {
    const calls = graph([{ ok: false, body: { error: { message: 'outside window', code: 10, error_subcode: 2018278 } } }])

    expect(await sendMessage('psid-1', 'page-token', 'Order summary')).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
