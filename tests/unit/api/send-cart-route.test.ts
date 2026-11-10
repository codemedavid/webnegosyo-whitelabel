/**
 * @jest-environment node
 *
 * POST /api/messenger/send-cart is public: anyone can post a cart for a
 * tenant/psid pair. The message it sends carries a checkout link, so the link
 * must be built from the tenant the SERVER resolved, never a caller-sent slug,
 * and the item payload must be bounded.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getActivePageById: jest.fn() }))
jest.mock('@/lib/facebook-api', () => ({ sendMessage: jest.fn() }))
// The reference → PSID check has its own tests (tests/unit/messenger/recipient.test.ts).
const resolveMessengerRecipient = jest.fn(async (_tenant: string, reference: string) => (reference === 'psid-1234' ? '24000000000001234' : null))
jest.mock('@/lib/messenger/recipient', () => ({ resolveMessengerRecipient: (...args: [string, string]) => resolveMessengerRecipient(...args) }))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 10, retryAfterSec: 0 })),
}))

const TENANT = {
  id: 'tenant-1',
  name: 'Retiro Cafe',
  slug: 'retiro',
  domain: null,
  facebook_page_id: 'page-1',
  is_active: true,
}

function chain(result: unknown) {
  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.single = jest.fn(async () => result)
  return builder
}

async function load() {
  const server = await import('@/lib/supabase/server')
  const admin = await import('@/lib/supabase/admin')
  const pages = await import('@/lib/facebook/page-tokens')
  const fb = await import('@/lib/facebook-api')
  jest.mocked(server.createClient).mockResolvedValue({
    from: jest.fn(() => chain({ data: TENANT, error: null })),
  } as never)
  jest.mocked(admin.createAdminClient).mockReturnValue({
    from: jest.fn(() => chain({ data: { id: 's1' }, error: null })),
  } as never)
  jest.mocked(pages.getActivePageById).mockResolvedValue({ page_access_token: 'tok' } as never)
  jest.mocked(fb.sendMessage).mockResolvedValue(true as never)
  const route = await import('@/app/api/messenger/send-cart/route')
  return { route, sendMessage: jest.mocked(fb.sendMessage) }
}

function post(body: unknown, origin = 'https://retiro.webnegosyo.app') {
  return new NextRequest('https://www.webnegosyo.app/api/messenger/send-cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.9', origin },
    body: JSON.stringify(body),
  })
}

const ITEM = { name: 'Latte', quantity: 1, subtotal: 150 }

describe('POST /api/messenger/send-cart', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV, PLATFORM_ROOT_DOMAIN: 'webnegosyo.app' }
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    jest.restoreAllMocks()
  })

  it('builds the checkout link from the server-resolved tenant slug, not the caller-sent one', async () => {
    const { route, sendMessage } = await load()

    const res = await route.POST(
      post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [ITEM], tenantSlug: 'phishing-site' }),
    )

    expect(res.status).toBe(200)
    const message = sendMessage.mock.calls[0][2] as string
    expect(message).toContain('https://retiro.webnegosyo.app/checkout')
    expect(message).not.toContain('phishing-site')
  })

  it('messages the PSID the server resolved, never the reference the browser sent', async () => {
    const { route, sendMessage } = await load()

    await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [ITEM] }))

    expect(resolveMessengerRecipient).toHaveBeenCalledWith('tenant-1', 'psid-1234')
    expect(sendMessage.mock.calls[0][0]).toBe('24000000000001234')
  })

  it('refuses a reference that does not resolve to this store', async () => {
    const { route, sendMessage } = await load()
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: '24000000000009999', items: [ITEM] }))

    expect(res.status).toBe(403)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('still works for a client that omits tenantSlug', async () => {
    const { route, sendMessage } = await load()

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [ITEM] }))

    expect(res.status).toBe(200)
    expect(sendMessage).toHaveBeenCalled()
  })

  it('refuses an oversized cart', async () => {
    const { route, sendMessage } = await load()
    const items = Array.from({ length: 101 }, () => ITEM)

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items }))

    expect(res.status).toBe(400)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('refuses an item name long enough to smuggle a message body', async () => {
    const { route, sendMessage } = await load()
    const items = [{ ...ITEM, name: 'x'.repeat(1000) }]

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items }))

    expect(res.status).toBe(400)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('refuses an overlong variation and a non-finite quantity', async () => {
    const { route } = await load()

    const longVariation = await route.POST(
      post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [{ ...ITEM, variation: 'v'.repeat(1000) }] }),
    )
    const badQuantity = await route.POST(
      post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [{ ...ITEM, quantity: 1e12 }] }),
    )

    expect(longVariation.status).toBe(400)
    expect(badQuantity.status).toBe(400)
  })

  it('does not reflect a look-alike origin that merely starts with the platform domain', async () => {
    const { route } = await load()

    const res = await route.OPTIONS(
      post({}, 'https://retiro.webnegosyo.app.attacker.example'),
    )

    expect(res.headers.get('access-control-allow-origin') ?? '').toBe('')
  })

  it('reflects a genuine tenant subdomain origin', async () => {
    const { route } = await load()

    const res = await route.OPTIONS(post({}, 'https://retiro.webnegosyo.app'))

    expect(res.headers.get('access-control-allow-origin')).toBe('https://retiro.webnegosyo.app')
  })

  it('never relays caller-written text: no item names, variations or prices reach the customer', async () => {
    const { route, sendMessage } = await load()
    const items = [{ name: 'FREE GCASH: visit evil.example', quantity: 2, subtotal: 1, variation: 'call 0917' }]

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items }))

    expect(res.status).toBe(200)
    const message = sendMessage.mock.calls[0][2] as string
    expect(message).toContain('Retiro Cafe')
    expect(message).toContain('2 items')
    expect(message).toContain('https://retiro.webnegosyo.app/checkout')
    expect(message).not.toMatch(/evil\.example|0917|GCASH/)
  })

  it('does not repeat the same count to the same person within the dedupe window', async () => {
    const { route, sendMessage } = await load()
    const limiter = await import('@/lib/distributed-rate-limit')
    jest.mocked(limiter.checkRateLimit).mockImplementation(async (key: string) => ({
      allowed: !key.startsWith('send-cart-same:'),
      remaining: 0,
      retryAfterSec: 30,
    }))

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [ITEM] }))

    expect(res.status).toBe(200)
    expect((await res.json()).duplicate).toBe(true)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('caps messages per person, whatever the caller IP', async () => {
    const { route, sendMessage } = await load()
    const limiter = await import('@/lib/distributed-rate-limit')
    jest.mocked(limiter.checkRateLimit).mockImplementation(async (key: string) => ({
      allowed: !key.startsWith('send-cart-psid:'),
      remaining: 0,
      retryAfterSec: 30,
    }))

    const res = await route.POST(post({ tenantId: 'tenant-1', psid: 'psid-1234', items: [ITEM] }))

    expect(res.status).toBe(429)
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
