/**
 * @jest-environment node
 *
 * Tests for POST /api/push/notify-order
 *
 * A database trigger on the platform `orders` table calls this route (via
 * pg_net) for every INSERT, so every write path — web checkout, the app's POS
 * register, QR-handoff accepts — rings the merchant without each caller having
 * to remember to. That is the same guarantee Convex tenants get from
 * `ctx.scheduler.runAfter(0, sendOrderNotification)` inside createOrder.
 *
 * The caller is unauthenticated (pg_net cannot keep a secret the migration
 * would not leak), so the route trusts NOTHING in the payload: it re-reads the
 * order by id with the service role, requires the tenant to match, and claims
 * a once-only row per order so a replayed request cannot ring twice.
 *
 * What Expo answers is READ, not assumed. Expo returns HTTP 200 while refusing
 * every device in the batch, which is how a mismatched Android FCM project
 * dropped every merchant notification on this platform for months while this
 * route reported a clean send. So the mock below answers in tickets, the way
 * the real service does.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

const ORDER_ID = '4c4b9e0a-8f2d-4a51-9d15-0f4d8c9a1b2c'
const TENANT_ID = '9a1b2c3d-4e5f-4a51-9d15-0f4d8c9a1b2c'
const OTHER_TENANT_ID = '11111111-2222-4333-8444-555555555555'

const ORDER = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  outlet_id: null,
  customer_name: 'Ana',
  total: 249.5,
  item_count: 2,
  customer_data: {},
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/notify-order', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/push/notify-order', () => {
  let orderRow: Record<string, unknown> | null
  let tokenRows: Array<{ token: string; outlet_id: string | null }>
  let claimInserted: boolean
  let fetchMock: jest.Mock
  let deletedTokens: string[]
  /** What Expo says about a device at send time; ok by default. */
  let ticketFor: (token: string) => Record<string, unknown>
  /** What the push provider says afterwards; ok by default. */
  let receiptFor: (receiptId: string) => Record<string, unknown>

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    orderRow = { ...ORDER }
    tokenRows = [{ token: 'ExponentPushToken[owner]', outlet_id: null }]
    claimInserted = true
    ticketFor = (token) => ({ status: 'ok', id: `receipt-${token}` })
    receiptFor = () => ({ status: 'ok' })

    deletedTokens = []
    // Expo's real shape: one ticket per message, positionally, then receipts
    // keyed by ticket id. `ticketFor` lets a test refuse a device.
    fetchMock = jest.fn((url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as
        | Array<{ to: string }>
        | { ids: string[] }
      if (Array.isArray(body)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: body.map((message) => ticketFor(message.to)) }),
        })
      }
      const receipts: Record<string, unknown> = {}
      for (const id of body.ids) receipts[id] = receiptFor(id)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: receipts }) })
    }) as jest.Mock
    global.fetch = fetchMock as unknown as typeof fetch

    const { createAdminClient } = jest.requireMock('@/lib/supabase/admin') as {
      createAdminClient: jest.Mock
    }
    createAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'order_push_notifications') {
          return {
            upsert: () => ({
              select: () =>
                Promise.resolve({
                  data: claimInserted ? [{ order_id: ORDER_ID }] : [],
                  error: null,
                }),
            }),
          }
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: orderRow, error: null }),
              }),
            }),
          }
        }
        if (table === 'push_tokens') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: tokenRows, error: null }),
            }),
            delete: () => ({
              in: (_column: string, tokens: string[]) => {
                deletedTokens.push(...tokens)
                return Promise.resolve({ error: null })
              },
            }),
          }
        }
        if (table === 'platform_device_tokens') {
          return {
            delete: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })
  })

  async function post(body: unknown) {
    const { POST } = await import('@/app/api/push/notify-order/route')
    return POST(makeRequest(body))
  }

  test('rejects a malformed payload without touching the database', async () => {
    const response = await post({ order_id: 'nope' })
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('sends one Expo push batch to the registered devices', async () => {
    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    const data = (await response.json()) as { sent: number }

    expect(response.status).toBe(200)
    expect(data.sent).toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    const messages = JSON.parse(init.body) as Array<{ to: string; body: string }>
    expect(messages[0].to).toBe('ExponentPushToken[owner]')
    expect(messages[0].body).toContain('Ana')
  })

  test('a replayed trigger call is a silent no-op', async () => {
    claimInserted = false
    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    const data = (await response.json()) as { sent: number; duplicate: boolean }

    expect(response.status).toBe(200)
    expect(data.duplicate).toBe(true)
    expect(data.sent).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('an order the payload lies about is never sent', async () => {
    const response = await post({ order_id: ORDER_ID, tenant_id: OTHER_TENANT_ID })
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('an unknown order is never sent', async () => {
    orderRow = null
    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a branched order skips devices bound to other branches', async () => {
    orderRow = { ...ORDER, outlet_id: 'outlet-north' }
    tokenRows = [
      { token: 'ExponentPushToken[owner]', outlet_id: null },
      { token: 'ExponentPushToken[north]', outlet_id: 'outlet-north' },
      { token: 'ExponentPushToken[south]', outlet_id: 'outlet-south' },
    ]

    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    const data = (await response.json()) as { sent: number }

    expect(data.sent).toBe(2)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const recipients = (JSON.parse(init.body) as Array<{ to: string }>).map((m) => m.to)
    expect(recipients).toEqual(['ExponentPushToken[owner]', 'ExponentPushToken[north]'])
  })

  test('a device Expo refuses is not reported as sent', async () => {
    // The outage shape: HTTP 200, and a refusal inside the ticket. Counting
    // this as a send is what kept a platform-wide failure invisible.
    ticketFor = () => ({
      status: 'error',
      message: 'Push notifications are not supported',
      details: { error: 'InvalidCredentials' },
    })

    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    const data = (await response.json()) as { sent: number; refused: number }

    expect(response.status).toBe(200)
    expect(data.sent).toBe(0)
    expect(data.refused).toBe(1)
  })

  test('a device the receipt says is gone is forgotten', async () => {
    // Only DeviceNotRegistered deletes a token. A provider-side refusal such
    // as MismatchSenderId means the platform is misconfigured, NOT that the
    // merchant uninstalled — deleting there would erase every live device.
    receiptFor = () => ({ status: 'error', details: { error: 'DeviceNotRegistered' } })

    await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })

    expect(deletedTokens).toEqual(['ExponentPushToken[owner]'])
  })

  test('a platform-wide refusal never deletes a live device', async () => {
    receiptFor = () => ({ status: 'error', details: { error: 'MismatchSenderId' } })

    await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })

    expect(deletedTokens).toEqual([])
  })

  test('no registered devices is a success with nothing to do', async () => {
    tokenRows = []
    const response = await post({ order_id: ORDER_ID, tenant_id: TENANT_ID })
    const data = (await response.json()) as { sent: number }

    expect(response.status).toBe(200)
    expect(data.sent).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
