/** @jest-environment node */
import { NextRequest } from 'next/server'

// The webhook answers 200 first and works after the response; run that work inline.
const pendingWork: Array<Promise<unknown>> = []
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (work: () => Promise<unknown>) => { pendingWork.push(work()) },
}))
jest.mock('server-only', () => ({}))
jest.mock('@/lib/messenger/dedupe', () => ({ claimEventOnce: jest.fn(async () => true) }))
jest.mock('@/lib/messenger/session', () => ({ touchSession: jest.fn(async () => null), setBotPause: jest.fn(async () => true) }))
jest.mock('@/lib/messenger/load-store', () => ({ loadStoreBundle: jest.fn(async () => null) }))

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/facebook/page-tokens', () => ({
  getActivePageByPageId: jest.fn(),
  getActivePageById: jest.fn(),
}))
jest.mock('@/lib/facebook-api', () => ({
  verifyWebhookSignature: jest.fn(() => true),
  sendMessage: jest.fn(async () => true),
}))
jest.mock('@/lib/messenger-message-formatter', () => ({ formatOrderMessage: jest.fn(() => 'Order summary') }))

const ORDER = { id: 'order-1', tenant_id: 'store-1', total: 198.99, status: 'pending', customer_data: {}, created_at: new Date().toISOString() }
const TENANT = { id: 'store-1', name: 'Sample Demo', facebook_page_id: 'fb-row-1' }

function adminClientWith(rows: Record<string, unknown>, options: { updateError?: unknown } = {}) {
  const updates: Array<{ table: string; patch: unknown; filters: Array<[string, unknown]> }> = []
  const from = jest.fn((table: string) => {
    const query: Record<string, jest.Mock> = {}
    const chain = () => query
    let pending: { table: string; patch: unknown; filters: Array<[string, unknown]> } | null = null
    query.select = jest.fn(chain)
    query.eq = jest.fn((column: string, value: unknown) => { pending?.filters.push([column, value]); return query })
    query.upsert = jest.fn(async () => ({ error: null }))
    query.update = jest.fn((patch: unknown) => {
      pending = { table, patch, filters: [] }
      updates.push(pending)
      return query
    })
    query.single = jest.fn(async () => ({ data: rows[table] ?? null, error: rows[table] ? null : { code: 'PGRST116' } }))
    ;(query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({
        data: table === 'order_items' ? [] : null,
        error: pending && options.updateError ? options.updateError : null,
      })
    return query
  })
  return { client: { from }, updates }
}

function referral(pageId: string) {
  const body = JSON.stringify({
    object: 'page',
    entry: [{ id: pageId, messaging: [{ sender: { id: 'psid-9' }, recipient: { id: pageId }, referral: { ref: 'ORDER_order-1_1793730000000' } }] }],
  })
  return new NextRequest('https://example.test/api/webhook', {
    method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=ok' },
  })
}

describe('Messenger webhook order referral', () => {
  const originalEnv = process.env
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv, FACEBOOK_APP_SECRET: 'secret' }
  })
  afterEach(() => { process.env = originalEnv })

  async function setup(
    pageIdOnStore: string,
    order: Record<string, unknown> = ORDER,
    options: { updateError?: unknown } = {},
  ) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { getActivePageById, getActivePageByPageId } = await import('@/lib/facebook/page-tokens')
    const { sendMessage } = await import('@/lib/facebook-api')
    const admin = adminClientWith({ orders: order, tenants: TENANT }, options)
    jest.mocked(createAdminClient).mockReturnValue(admin.client as never)
    jest.mocked(getActivePageById).mockResolvedValue({ page_id: pageIdOnStore, page_access_token: 'page-token' } as never)
    // The webhook first finds which store the messaged Page belongs to.
    jest.mocked(getActivePageByPageId).mockResolvedValue({ tenant_id: 'store-1', page_access_token: 'page-token' } as never)
    const { POST: post } = await import('@/app/api/webhook/route')
    const POST = async (request: NextRequest) => {
      const response = await post(request)
      await Promise.all(pendingWork.splice(0))
      return response
    }
    return { POST, sendMessage: jest.mocked(sendMessage), admin }
  }

  it('reads the order with the service role and sends its summary on the store page', async () => {
    const { POST, sendMessage, admin } = await setup('page-596')

    const response = await POST(referral('page-596'))

    expect(response.status).toBe(200)
    expect(sendMessage).toHaveBeenCalledWith('psid-9', 'page-token', 'Order summary')
    expect(admin.updates).toContainEqual(expect.objectContaining({ table: 'orders' }))
  })

  it('refuses a second person once the order belongs to a Messenger conversation', async () => {
    const claimed = { ...ORDER, customer_data: { messenger_psid: 'psid-owner' } }
    const { POST, sendMessage, admin } = await setup('page-596', claimed)

    await POST(referral('page-596'))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalledWith('psid-9', 'page-token', 'Order summary')
    expect(admin.updates).toEqual([])
  })

  it('still answers the conversation that already owns the order', async () => {
    const claimed = { ...ORDER, customer_data: { messenger_psid: 'psid-9' } }
    const { POST, sendMessage } = await setup('page-596', claimed)

    await POST(referral('page-596'))

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('refuses a referral for an old order', async () => {
    const old = { ...ORDER, created_at: '2020-01-01T00:00:00.000Z' }
    const { POST, sendMessage, admin } = await setup('page-596', old)

    await POST(referral('page-596'))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalledWith('psid-9', 'page-token', 'Order summary')
    expect(admin.updates).toEqual([])
  })

  it('stores the PSID only if the order has not changed since it was read', async () => {
    const read = { ...ORDER, updated_at: '2026-11-09T03:00:00.000Z' }
    const { POST, admin } = await setup('page-596', read)

    await POST(referral('page-596'))

    const write = admin.updates.find((u) => u.table === 'orders')
    expect(write?.filters).toEqual(expect.arrayContaining([
      ['id', 'order-1'],
      ['updated_at', '2026-11-09T03:00:00.000Z'],
    ]))
  })

  it('stores the PSID by id alone when the row carries no updated_at', async () => {
    const { POST, admin } = await setup('page-596')

    await POST(referral('page-596'))

    const write = admin.updates.find((u) => u.table === 'orders')
    expect(write?.filters).toEqual([['id', 'order-1']])
  })

  it('logs a refused PSID write and still answers 200', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { POST, sendMessage } = await setup('page-596', ORDER, { updateError: { message: 'boom' } })

    const response = await POST(referral('page-596'))

    expect(response.status).toBe(200)
    expect(sendMessage).toHaveBeenCalledWith('psid-9', 'page-token', 'Order summary')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to store sender mapping'), 'boom')
    errorSpy.mockRestore()
  })

  it('never answers an order on a page that is not the store’s', async () => {
    const { POST, sendMessage } = await setup('page-596')

    await POST(referral('page-OTHER'))

    expect(sendMessage).not.toHaveBeenCalled()
  })
})
