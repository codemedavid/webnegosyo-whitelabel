/**
 * The wizard's error line is the buyer's only clue. On 2026-10-10 a server
 * crash (bare 500, HTML body) read "Connection problem. Check your internet" —
 * the buyer blamed their phone while every tap failed on our side.
 */
import { describe, it, expect, afterEach } from '@jest/globals'

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
})

function respondWith(status: number, body: string): void {
  // jsdom has no Response; the module only reads `ok` and `json()`.
  const response = { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) }
  global.fetch = jest.fn(async () => response) as unknown as typeof fetch
}

async function submit() {
  const { submitOnboarding } = await import('@/components/onboarding/onboarding-api')
  return submitOnboarding('token', {} as never, 'password123')
}

describe('onboarding-api error messages', () => {
  it('passes the server’s own message through', async () => {
    respondWith(409, JSON.stringify({ error: 'Your store is already being set up.' }))
    await expect(submit()).resolves.toEqual({ ok: false, error: 'Your store is already being set up.' })
  })

  it('does not blame the buyer’s internet for a server crash without a message', async () => {
    respondWith(500, '<html>Internal Server Error</html>')
    const result = await submit()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).not.toMatch(/internet/i)
    expect(result.error).toMatch(/our side/i)
  })

  it('still says "connection" when the request never reached us', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Load failed')
    }) as unknown as typeof fetch
    const result = await submit()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/internet/i)
  })
})
