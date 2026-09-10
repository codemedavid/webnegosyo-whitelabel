/**
 * @jest-environment node
 *
 * POST /api/messenger/send-order-public
 *
 * This route is PUBLIC and its caller is an anonymous checkout browser. Its
 * security boundary is the short-lived order token plus the per-IP rate limit —
 * never RLS, which grants `anon` nothing but INSERT on `public.orders`. Run
 * through the visitor's cookie session the route read no order (404), read no
 * line items (a Messenger message with zero items), and — worst — its
 * "mark as sent" UPDATE matched zero rows and returned NO error, so it reported
 * success while `messenger_message_sent_at` stayed empty. That field is exactly
 * what the duplicate-send guard reads, so every retry re-sent the whole order
 * message to the customer.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

const mockCreateAdminClient = jest.fn()
const mockCreateCookieClient = jest.fn()
const mockVerifyOrderToken = jest.fn(() => Promise.resolve(true))
const mockGetActivePageById = jest.fn(() => Promise.resolve({ page_access_token: 'page-token' }))
const mockSendMessage = jest.fn(() => Promise.resolve(true))
const mockFormatOrderMessage = jest.fn((order: { items: unknown[] }, tenant: unknown) => {
  void order
  void tenant
  return 'formatted message'
})

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
jest.mock('@/lib/supabase/server', () => ({ createClient: mockCreateCookieClient }))
jest.mock('@/lib/order-token', () => ({ verifyOrderToken: mockVerifyOrderToken }))
jest.mock('@/lib/facebook/page-tokens', () => ({ getActivePageById: mockGetActivePageById }))
jest.mock('@/lib/facebook-api', () => ({ sendMessage: mockSendMessage }))
jest.mock('@/lib/messenger-message-formatter', () => ({ formatOrderMessage: mockFormatOrderMessage }))

const ORDER_ID = '4c4b9e0a-8f2d-4a51-9d15-0f4d8c9a1b2c'
const TENANT_ID = '9a1b2c3d-4e5f-4a51-9d15-0f4d8c9a1b2c'

const ORDER_ROW = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  total: 249.5,
  created_at: '2026-09-10T01:00:00.000Z',
  updated_at: '2026-09-10T01:00:00.000Z',
  customer_data: { messenger_psid: 'psid-123456' },
}

const ORDER_ITEM_ROWS = [
  { menu_item_name: 'Tapsilog', quantity: 2, subtotal: 320, addons: [] },
]

const TENANT_ROW = { id: TENANT_ID, name: 'Island Silog', facebook_page_id: 'page-1' }

interface MarkResult {
  error: { message: string } | null
  count: number | null
}

interface AdminFake {
  client: { from: unknown }
  from: jest.Mock<(table: string) => unknown>
  markSent: jest.Mock<(payload: unknown, options?: unknown) => unknown>
}

function makeAdminFake(markResult: MarkResult): AdminFake {
  const markSent = jest.fn((payload: unknown, options?: unknown) => {
    void payload
    void options
    return { eq: () => Promise.resolve(markResult) }
  })

  const from = jest.fn((table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: ORDER_ROW, error: null }) }),
          }),
        }),
        update: markSent,
      }
    }
    if (table === 'tenants') {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: TENANT_ROW, error: null }) }),
        }),
      }
    }
    if (table === 'order_items') {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: ORDER_ITEM_ROWS, error: null }) }),
      }
    }
    throw new Error(`Unexpected table read: ${table}`)
  })

  return { client: { from }, from, markSent }
}

/** Install a fake as whatever `createAdminClient()` hands back. */
function installAdminFake(markResult: MarkResult = { error: null, count: 1 }): AdminFake {
  const fake = makeAdminFake(markResult)
  mockCreateAdminClient.mockReturnValue(fake.client)
  return fake
}

let ipCounter = 0

function makeRequest(): NextRequest {
  ipCounter += 1
  return new NextRequest('https://store.example/api/messenger/send-order-public', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // A fresh IP per request so the real rate limiter never colours a result.
      'x-vercel-forwarded-for': `203.0.113.${ipCounter}`,
    },
    body: JSON.stringify({ orderId: ORDER_ID, tenantId: TENANT_ID, orderToken: 'a'.repeat(64) }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerifyOrderToken.mockResolvedValue(true)
  mockGetActivePageById.mockResolvedValue({ page_access_token: 'page-token' })
  mockSendMessage.mockResolvedValue(true)
  mockFormatOrderMessage.mockReturnValue('formatted message')
})

describe('POST /api/messenger/send-order-public', () => {
  test('reads the order and its line items through the service role', async () => {
    const fake = installAdminFake()
    const { POST } = await import('@/app/api/messenger/send-order-public/route')

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(mockCreateAdminClient).toHaveBeenCalled()
    expect(mockCreateCookieClient).not.toHaveBeenCalled()
    expect(fake.from).toHaveBeenCalledWith('orders')
    expect(fake.from).toHaveBeenCalledWith('order_items')

    // The line items have to reach the formatter — under the cookie client this
    // arrived as an empty array and the merchant got an itemless order message.
    expect(mockFormatOrderMessage.mock.calls[0]?.[0].items).toHaveLength(1)
  })

  test('treats a zero-row mark-as-sent as a failure, not a success', async () => {
    installAdminFake({ error: null, count: 0 })
    const { POST } = await import('@/app/api/messenger/send-order-public/route')

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(207)
    expect(body.warning).toBeTruthy()
    expect(body.message).not.toBe('Order message sent')
  })

  test('counts the rows the mark-as-sent UPDATE touched', async () => {
    const fake = installAdminFake()
    const { POST } = await import('@/app/api/messenger/send-order-public/route')

    await POST(makeRequest())

    expect(fake.markSent).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_data: expect.objectContaining({
          messenger_message_sent_at: expect.any(String),
        }),
      }),
      expect.objectContaining({ count: 'exact' })
    )
  })

  test('reports plain success only when the order row was really marked', async () => {
    installAdminFake({ error: null, count: 1 })
    const { POST } = await import('@/app/api/messenger/send-order-public/route')

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, message: 'Order message sent' })
  })

  test('still reports partial success when the mark-as-sent UPDATE errors', async () => {
    installAdminFake({ error: { message: 'boom' }, count: null })
    const { POST } = await import('@/app/api/messenger/send-order-public/route')

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(207)
    expect(body.warning).toBeTruthy()
  })
})
