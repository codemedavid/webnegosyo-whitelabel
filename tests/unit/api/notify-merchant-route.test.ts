/**
 * @jest-environment node
 *
 * Tests for POST /api/push/notify-merchant
 *
 * A statement trigger on `merchant_notifications` (fed by `stock_alerts`)
 * calls this route through pg_net with ids only. The caller is
 * unauthenticated, so nothing in the payload is trusted: the rows are re-read
 * with the service role, and claiming `push_claimed_at` makes a replay silent.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

const TENANT_ID = '9a1b2c3d-4e5f-4a51-9d15-0f4d8c9a1b2c'
const NOTIFICATION_ID = '4c4b9e0a-8f2d-4a51-9d15-0f4d8c9a1b2c'
const CASH_ID = '5d5c0f1b-9a3e-4b62-8e26-1a5e9d0b2c3d'

const NOTIFICATION = {
  id: NOTIFICATION_ID,
  tenant_id: TENANT_ID,
  outlet_id: null,
  kind: 'stock_out',
  inventory_item_id: 'item-flour',
  item_name: 'Flour',
  unit: 'kg',
  outlet_name: null,
  quantity: 0,
  reorder_level: 5,
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/notify-merchant', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/push/notify-merchant', () => {
  let claimedRows: Array<Record<string, unknown>>
  let claimFilter: { ids: string[]; unclaimedOnly: boolean } | null
  let released: string[]
  let tokenReadError: { message: string } | null
  let tokenRows: Array<{ token: string; user_id: string; tenant_id: string | null }>
  let accountRows: Array<Record<string, unknown>>
  let fetchMock: jest.Mock
  let deletedTokens: string[]
  let ticketFor: (token: string) => Record<string, unknown>

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    claimedRows = [{ ...NOTIFICATION }]
    claimFilter = null
    released = []
    tokenReadError = null
    tokenRows = [
      { token: 'ExponentPushToken[owner]', user_id: 'owner', tenant_id: TENANT_ID },
      { token: 'ExponentPushToken[cashier]', user_id: 'cashier', tenant_id: TENANT_ID },
    ]
    accountRows = [
      { user_id: 'owner', tenant_id: TENANT_ID, role: 'admin', is_owner: true, permissions: null, outlet_id: null },
      { user_id: 'cashier', tenant_id: TENANT_ID, role: 'admin', is_owner: false, permissions: ['pos'], outlet_id: null },
    ]
    deletedTokens = []
    ticketFor = (token) => ({ status: 'ok', id: `receipt-${token}` })

    fetchMock = jest.fn((_url: unknown, init: unknown) => {
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
      for (const id of body.ids) receipts[id] = { status: 'ok' }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: receipts }) })
    }) as jest.Mock
    global.fetch = fetchMock as unknown as typeof fetch

    const { createAdminClient } = jest.requireMock('@/lib/supabase/admin') as {
      createAdminClient: jest.Mock
    }
    createAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'merchant_notifications') {
          return {
            update: (values: { push_claimed_at: string | null }) => ({
              in: (_column: string, ids: string[]) => ({
                then: (resolve: (v: unknown) => void) => {
                  if (values.push_claimed_at === null) released.push(...ids)
                  resolve({ error: null })
                },
                is: (column: string, value: null) => {
                  claimFilter = { ids, unclaimedOnly: column === 'push_claimed_at' && value === null }
                  return {
                    select: () => Promise.resolve({ data: claimedRows, error: null }),
                  }
                },
              }),
            }),
          }
        }
        if (table === 'platform_device_tokens') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve(
                  tokenReadError ? { data: null, error: tokenReadError } : { data: tokenRows, error: null },
                ),
            }),
            delete: () => ({
              in: (_column: string, tokens: string[]) => {
                deletedTokens.push(...tokens)
                return Promise.resolve({ error: null })
              },
            }),
          }
        }
        if (table === 'app_users') {
          return {
            select: () => ({
              in: () => ({
                in: () => Promise.resolve({ data: accountRows, error: null }),
              }),
            }),
          }
        }
        if (table === 'push_tokens') {
          return { delete: () => ({ in: () => Promise.resolve({ error: null }) }) }
        }
        throw new Error(`unexpected table ${table}`)
      },
    })
  })

  async function post(body: unknown) {
    const { POST } = await import('@/app/api/push/notify-merchant/route')
    return POST(makeRequest(body))
  }

  function sentMessages(): Array<Record<string, unknown>> {
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/push/send'))
    return call ? (JSON.parse((call[1] as { body: string }).body) as Array<Record<string, unknown>>) : []
  }

  test('rejects a malformed payload without touching the database', async () => {
    const response = await post({ notification_ids: ['nope'] })
    expect(response.status).toBe(400)
    expect(claimFilter).toBeNull()
  })

  test('claims only unclaimed rows, then pushes to devices that may see them', async () => {
    const response = await post({ notification_ids: [NOTIFICATION_ID] })
    const json = await response.json()

    expect(claimFilter).toEqual({ ids: [NOTIFICATION_ID], unclaimedOnly: true })
    expect(json).toEqual({ sent: 1, refused: 0 })
    expect(sentMessages()).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[owner]',
        channelId: 'stock-alerts',
        title: 'Flour is out of stock',
        body: 'None left · reorder at 5 kg',
        data: { type: 'stock_alert', inventoryItemId: 'item-flour' },
      }),
    ])
  })

  test('pushes a cash alert (W3.3) only to devices that handle cash, alongside stock alerts', async () => {
    claimedRows = [
      { ...NOTIFICATION },
      {
        id: CASH_ID,
        tenant_id: TENANT_ID,
        outlet_id: null,
        kind: 'remittance_pending',
        inventory_item_id: null,
        item_name: 'Ana Reyes',
        unit: null,
        outlet_name: null,
        quantity: null,
        reorder_level: null,
        shift_id: null,
        remittance_id: 'rem-1',
        drawer_name: 'Cashier 1',
        cash_cents: '634500',
      },
    ]
    accountRows = [
      ...accountRows,
      { user_id: 'manager', tenant_id: TENANT_ID, role: 'admin', is_owner: false, permissions: ['cash_manage'], outlet_id: null },
    ]
    tokenRows = [...tokenRows, { token: 'ExponentPushToken[manager]', user_id: 'manager', tenant_id: TENANT_ID }]

    await post({ notification_ids: [NOTIFICATION_ID, CASH_ID] })

    const cash = sentMessages().filter((message) => (message.data as { type: string }).type === 'cash_alert')
    expect(cash.map((message) => message.to).sort()).toEqual(['ExponentPushToken[manager]', 'ExponentPushToken[owner]'])
    expect(cash[0]).toEqual(
      expect.objectContaining({
        channelId: 'cash-alerts',
        title: "Ana's ₱6,345 is waiting to be accepted",
        body: 'Cashier 1 · Accept it in Remittances',
        data: { type: 'cash_alert', kind: 'remittance_pending', remittanceId: 'rem-1' },
      }),
    )
  })

  test('a replay that claims nothing sends nothing', async () => {
    claimedRows = []
    const json = await (await post({ notification_ids: [NOTIFICATION_ID] })).json()

    expect(json).toEqual({ sent: 0, duplicate: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('gives the claim back when recipients cannot be read', async () => {
    tokenReadError = { message: 'timeout' }
    const response = await post({ notification_ids: [NOTIFICATION_ID] })

    expect(response.status).toBe(500)
    expect(released).toEqual([NOTIFICATION_ID])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('gives the claim back when Expo cannot be reached at all', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')))
    const response = await post({ notification_ids: [NOTIFICATION_ID] })

    expect(response.status).toBe(502)
    expect(released).toEqual([NOTIFICATION_ID])
  })

  test('forgets devices Expo says are gone', async () => {
    ticketFor = () => ({
      status: 'error',
      message: 'gone',
      details: { error: 'DeviceNotRegistered' },
    })
    const json = await (await post({ notification_ids: [NOTIFICATION_ID] })).json()

    expect(json).toEqual({ sent: 0, refused: 1 })
    expect(deletedTokens).toEqual(['ExponentPushToken[owner]'])
  })
})
