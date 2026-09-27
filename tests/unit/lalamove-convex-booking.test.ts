/** @jest-environment node */
jest.mock('../../convex-template/convex/_generated/server', () => ({
  action: (config: unknown) => config,
  mutation: (config: unknown) => config, internalMutation: (config: unknown) => config,
  query: (config: unknown) => config, internalQuery: (config: unknown) => config,
}))
jest.mock('../../convex-template/convex/_generated/api', () => ({
  internal: {
    config: { getConfigs: 'getConfigs' },
    orders: new Proxy({}, { get: (_target, name) => name }),
  },
}))
jest.mock('../../convex-template/convex/auth', () => ({
  requireActionAccess: jest.fn(), requireAccess: jest.fn(),
}))
import { bookLalamove, requoteLalamove, syncLalamoveStatus } from '../../convex-template/convex/lalamove'
import * as mutations from '../../convex-template/convex/orders'

type Row = Record<string, unknown>
type Handler = { handler: (ctx: unknown, args: Row) => Promise<unknown> }
const run = (fn: unknown, ctx: unknown, args: Row) => (fn as Handler).handler(ctx, args)
let order: Row
let ctx: { runQuery: jest.Mock; runMutation: jest.Mock }
let requests: string[]
let postResponse: () => Promise<Response>
let failPersistence: boolean

beforeEach(() => {
  order = {
    _id: 'o1', lalamoveQuotationId: 'q1', customerName: 'Ana', customerContact: '09171234567',
    deliveryAddress: 'Mabini St', deliveryLatitude: 14.7, deliveryLongitude: 121.05,
  }
  requests = []
  failPersistence = false
  const config = {
    lalamove_api_key: 'key', lalamove_secret_key: 'secret', lalamove_market: 'PH',
    lalamove_sender_phone: '09170000000', restaurant_address: 'Retiro St',
    restaurant_latitude: '14.6', restaurant_longitude: '121.0',
  }
  const db = {
    get: async () => ({ ...order }),
    patch: async (_id: string, patch: Row) => {
      if (failPersistence && patch.lalamoveOrderId) throw new Error('Storage unavailable')
      order = { ...order, ...patch }
    },
  }
  // Convex mutations are atomic transactions; serialize them in the fake DB.
  let transaction = Promise.resolve<unknown>(undefined)
  ctx = {
    runQuery: jest.fn(async (ref: string) => ref === 'getConfigs'
      ? Object.entries(config).map(([key, value]) => ({ key, value })) : { ...order }),
    runMutation: jest.fn((ref: string, args: Row) => {
      const current = transaction.then(() => run(mutations[ref as keyof typeof mutations], { db }, args))
      transaction = current.catch(() => undefined)
      return current
    }),
  }
  postResponse = async () => new Response(JSON.stringify({ data: { orderId: 'lala-1', status: 'ASSIGNING_DRIVER' } }))
  global.fetch = jest.fn(async (url, init) => {
    const request = `${init?.method} ${url}`
    requests.push(request)
    if (request.includes('GET') && request.includes('/quotations/')) {
      return new Response(JSON.stringify({ data: {
        expiresAt: '2099-01-01T00:00:00Z', stops: [{ stopId: 'pickup' }, { stopId: 'dropoff' }],
      } }))
    }
    if (request.includes('/quotations')) {
      return new Response(JSON.stringify({ data: { quotationId: 'q2', priceBreakdown: { total: '90' } } }))
    }
    return postResponse()
  })
})

test('concurrent Convex booking actions request only one paid rider', async () => {
  const results = await Promise.all([
    run(bookLalamove, ctx, { orderId: 'o1' }), run(bookLalamove, ctx, { orderId: 'o1' }),
  ]) as Array<{ success: boolean }>
  expect(requests.filter((request) => request.includes('POST') && request.endsWith('/orders'))).toHaveLength(1)
  expect(results.filter((result) => result.success)).toHaveLength(1)
  expect(order.lalamoveOrderId).toBe('lala-1')
})

test('a definitive provider refusal releases the claim for a fresh quotation', async () => {
  postResponse = async () => new Response(JSON.stringify({ errors: [{ message: 'INVALID_QUOTATION' }] }), { status: 422 })

  const result = await run(bookLalamove, ctx, { orderId: 'o1' })

  expect(result).toMatchObject({ success: false })
  expect(order.lalamoveStatus).toBeUndefined()
})

test('an ambiguous provider failure keeps the booking locked and prevents requoting', async () => {
  postResponse = async () => { throw new Error('Connection reset') }
  const result = await run(bookLalamove, ctx, { orderId: 'o1' })
  expect(result).toMatchObject({ success: false, error: expect.stringMatching(/may.*booked/i) })
  expect(order.lalamoveStatus).toBe('BOOKING')

  const requoted = await run(requoteLalamove, ctx, { orderId: 'o1' })
  expect(requoted).toMatchObject({ success: false })
  expect(order.lalamoveQuotationId).toBe('q1')
})

test('a paid booking persistence failure reports its reference without unlocking another booking', async () => {
  failPersistence = true

  await expect(run(bookLalamove, ctx, { orderId: 'o1' })).resolves.toMatchObject({
    success: false, error: expect.stringMatching(/lala-1.*save.*check Lalamove/i),
  })
  expect(order.lalamoveStatus).toBe('BOOKING')
})

test('a provider success with no booking ID stays unresolved instead of reporting a booked rider', async () => {
  postResponse = async () => new Response(JSON.stringify({ data: {} }))

  expect(await run(bookLalamove, ctx, { orderId: 'o1' })).toMatchObject({ success: false })
  expect(order.lalamoveStatus).toBe('BOOKING')
})

test('a quote response cannot overwrite a quotation already claimed for booking', async () => {
  ;(global.fetch as jest.Mock).mockImplementation(async () => {
    order = { ...order, lalamoveStatus: 'BOOKING' }
    return new Response(JSON.stringify({ data: { quotationId: 'q2' } }))
  })

  expect(await run(requoteLalamove, ctx, { orderId: 'o1' })).toMatchObject({ success: false })
  expect(order.lalamoveQuotationId).toBe('q1')
})

test('the public details mutation cannot clear a pending booking claim', async () => {
  order.lalamoveStatus = 'BOOKING'
  const db = {
    get: async () => ({ ...order }),
    patch: async (_id: string, patch: Row) => { order = { ...order, ...patch } },
  }

  await expect(run(mutations.updateLalamoveDetails, { db }, {
    orderId: 'o1', lalamoveStatus: '',
  })).rejects.toThrow(/booking.*confirmation/i)
  expect(order.lalamoveStatus).toBe('BOOKING')
})

test('a delayed status response cannot overwrite a replacement booking claim', async () => {
  order = { ...order, lalamoveOrderId: 'old-rider', lalamoveStatus: 'ON_GOING' }
  ;(global.fetch as jest.Mock).mockImplementation(async () => {
    order = { ...order, lalamoveOrderId: undefined, lalamoveStatus: 'BOOKING' }
    return new Response(JSON.stringify({ data: { status: 'CANCELLED' } }))
  })

  expect(await run(syncLalamoveStatus, ctx, { orderId: 'o1' })).toMatchObject({ success: false })
  expect(order.lalamoveStatus).toBe('BOOKING')
})
