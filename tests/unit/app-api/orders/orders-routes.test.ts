/** @jest-environment node */
import { NextRequest } from 'next/server'
import { appEnvelopeSchema, appOrderDetailSchema, appOrderPageSchema, appVoucherPreviewSchema } from '@/lib/app-contract'
import { CASH, CUSTOMER, DISH, KEY, LARGE, PICKUP_TYPE, SIZE_GROUP, TENANT, draft, placedResult, placedRow } from './order-fixtures'

jest.mock('server-only', () => ({}))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))
const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }))
const resolveCustomerSession = jest.fn()
const readProfile = jest.fn()
jest.mock('@/lib/customer-auth/account', () => ({
  resolveCustomerSession: (...a: unknown[]) => resolveCustomerSession(...a),
  readProfile: (...a: unknown[]) => readProfile(...a),
}))
jest.mock('@/lib/app-api/store-reads', () => ({ AppReadError: class AppReadError extends Error {} }))

const index = {
  claimOrderKey: jest.fn(),
  markPlaced: jest.fn(),
  markFailed: jest.fn(),
  reopenFailed: jest.fn(),
  takeOverStalePlacing: jest.fn(),
  getCustomerOrder: jest.fn(),
  listCustomerOrders: jest.fn(),
  recordStatus: jest.fn(),
}
jest.mock('@/lib/app-api/orders/order-index', () => ({
  createOrderIndex: () => index,
  isValidIdempotencyKey: (key: string) => /^[!-~]{8,100}$/.test(key),
}))
const readDraftTenant = jest.fn()
const loadDraft = jest.fn()
jest.mock('@/lib/app-api/orders/load-draft', () => ({
  readDraftTenant: (...a: unknown[]) => readDraftTenant(...a),
  loadDraft: (...a: unknown[]) => loadDraft(...a),
}))
const readOrderTypes = jest.fn()
const readPaymentMethods = jest.fn()
jest.mock('@/lib/checkout/load-checkout-config', () => ({
  readOrderTypes: (...a: unknown[]) => readOrderTypes(...a),
  readPaymentMethods: (...a: unknown[]) => readPaymentMethods(...a),
}))
const readCheckoutQuestionsFresh = jest.fn()
jest.mock('@/lib/app-api/store-reads', () => ({
  ...jest.requireActual('@/lib/app-api/store-reads'),
  readCheckoutQuestionsFresh: (...a: unknown[]) => readCheckoutQuestionsFresh(...a),
}))
const placeOrder = jest.fn()
jest.mock('@/lib/checkout/place-order', () => ({ placeOrder: (...a: unknown[]) => placeOrder(...a) }))
const loadAndPriceOrderLines = jest.fn()
jest.mock('@/lib/checkout/load-line-pricing', () => ({ loadAndPriceOrderLines: (...a: unknown[]) => loadAndPriceOrderLines(...a) }))
const priceOrderVouchers = jest.fn()
jest.mock('@/lib/checkout/place-order/pricing', () => ({ priceOrderVouchers: (...a: unknown[]) => priceOrderVouchers(...a) }))
const findByCodes = jest.fn()
jest.mock('@/lib/vouchers/repository', () => ({ createVoucherLookup: () => ({ findByCodes, countCustomerRedemptions: async () => ({}) }) }))
const fetchOrderTrackingContext = jest.fn()
jest.mock('@/lib/order-tracking-service', () => ({ fetchOrderTrackingContext: (...a: unknown[]) => fetchOrderTrackingContext(...a) }))
jest.mock('@/lib/tracking-token', () => ({ generateTrackingToken: (id: string) => `tok-${id}` }))
jest.mock('@/lib/supabase/admin', () => ({ ADMIN_QUERY_TIMEOUT_MS: 8000, createAdminClient: () => ({}) }))
jest.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({}) }))

const RELEASE = { minimumVersion: null, latestVersion: null, storeUrl: null }
const APP = { tenantId: TENANT, slug: 'beracah-cafe', status: 'live', ios: RELEASE, android: RELEASE }
const AUTH = { authorization: `Bearer cs1.${'A'.repeat(43)}` }
const DISH_ROW = {
  id: DISH, tenant_id: TENANT, category_id: 'cat-1', name: 'Iced Latte', price: 120, is_available: true, variations: [], addons: [],
  variation_types: [{ id: SIZE_GROUP, name: 'Size', is_required: true, options: [{ id: LARGE, name: 'Large', price_modifier: 10 }] }],
}

function request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers = { 'x-app-id': 'com.webnegosyo.beracah', ...AUTH, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...init.headers }
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
}

const routes = async () => ({
  placeOrder: (await import('@/app/api/app/v1/orders/route')).POST,
  getOrder: (await import('@/app/api/app/v1/orders/[id]/route')).GET,
  myOrders: (await import('@/app/api/app/v1/me/orders/route')).GET,
  voucherPreview: (await import('@/app/api/app/v1/vouchers/preview/route')).POST,
})

const placeRequest = (body: unknown = draft(), headers: Record<string, string> = { 'idempotency-key': KEY }) =>
  request('/api/app/v1/orders', { method: 'POST', body, headers })

beforeEach(() => {
  jest.clearAllMocks()
  readCheckoutQuestionsFresh.mockResolvedValue([])
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 })
  resolveCustomerSession.mockResolvedValue({ customerId: CUSTOMER, tokenHash: 'h' })
  readProfile.mockResolvedValue({ name: 'Ana', phoneE164: '+639171234567' })
  readDraftTenant.mockResolvedValue({ id: TENANT, row: { id: TENANT }, backend: 'platform', isLalamove: false, isMultiBranch: false, modifierGroupsEnabled: false })
  loadDraft.mockImplementation(async (_db, _tenant, req) => ({
    ok: true,
    outlet: null,
    input: { lines: req.lines, menuItems: new Map([[DISH, DISH_ROW]]), categories: [{ id: 'cat-1', is_active: true }], tenant: { id: TENANT }, branchIndex: new Map(), outletId: null },
  }))
  readOrderTypes.mockResolvedValue([{ id: PICKUP_TYPE, type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true }])
  readPaymentMethods.mockResolvedValue([{ id: CASH, name: 'Cash', is_active: true, payment_method_order_types: [{ order_type_id: PICKUP_TYPE }] }])
  index.claimOrderKey.mockResolvedValue({ kind: 'claimed', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
  index.markPlaced.mockResolvedValue(true)
  index.markFailed.mockResolvedValue(true)
  index.getCustomerOrder.mockResolvedValue(placedRow())
  index.listCustomerOrders.mockResolvedValue({ ok: true, orders: [placedRow()], nextCursor: null })
  index.recordStatus.mockResolvedValue(true)
  placeOrder.mockResolvedValue(placedResult())
  fetchOrderTrackingContext.mockResolvedValue({ data: { status: 'confirmed', dailyNumber: 7, loyaltyIdentity: { paymentStatus: 'pending' } }, error: null })
})

describe('POST /api/app/v1/orders', () => {
  it('needs a signed-in customer of this store', async () => {
    resolveCustomerSession.mockResolvedValue(null)
    const response = await (await routes()).placeOrder(placeRequest())
    expect(response.status).toBe(401)
    expect(index.claimOrderKey).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ 'idempotency-key': 'short' }], [{ 'idempotency-key': 'has a space in it' }]])('needs a valid Idempotency-Key (%p)', async (headers) => {
    const response = await (await routes()).placeOrder(placeRequest(draft(), headers))
    expect(response.status).toBe(400)
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('refuses a body that is not a draft', async () => {
    expect((await (await routes()).placeOrder(placeRequest({ lines: [] }))).status).toBe(400)
  })

  it('places the order (201) through the engine with channel app and the key as clientOrderId', async () => {
    const response = await (await routes()).placeOrder(placeRequest())
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = appEnvelopeSchema(appOrderDetailSchema).parse(await response.json())
    expect(body.success && body.data).toMatchObject({ id: 'order-1', status: 'pending', number: '07' })
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ channel: 'app', clientOrderId: KEY, tenantId: TENANT }))
  })

  it('a refusal is 422 with the store’s words', async () => {
    placeOrder.mockResolvedValue({ kind: 'refused', error: 'We are closed right now.' })
    const response = await (await routes()).placeOrder(placeRequest())
    expect(response.status).toBe(422)
    expect((await response.json()).error).toEqual({ code: 'refused', message: 'We are closed right now.' })
  })

  it('answers the store’s questions: what the app was asked, plus renamed contact questions from the session', async () => {
    readCheckoutQuestionsFresh.mockResolvedValue([
      { id: 'q1', order_type_id: PICKUP_TYPE, field_name: 'pickup_date', field_label: 'Pickup date', field_type: 'date', is_required: true, placeholder: null, options: null, order_index: 2 },
      { id: 'q2', order_type_id: PICKUP_TYPE, field_name: 'Contact Number', field_label: 'Contact Number', field_type: 'text', is_required: true, placeholder: null, options: null, order_index: 1 },
    ])
    const body = draft({ answers: { pickup_date: ' 2026-11-13 ', customer_phone: '+639000000000', unasked: 'x' } })
    expect((await (await routes()).placeOrder(placeRequest(body))).status).toBe(201)
    const customerData = placeOrder.mock.calls[0][0].customerData
    expect(customerData).toMatchObject({ pickup_date: '2026-11-13', 'Contact Number': '+639171234567', customer_phone: '+639171234567' })
    expect(customerData).not.toHaveProperty('unasked')
  })

  it('an unanswered question comes back as fieldErrors the app can point at', async () => {
    placeOrder.mockResolvedValue({ kind: 'refused', error: 'Pickup date is required', fieldErrors: [{ fieldName: 'pickup_date', message: 'Pickup date is required' }] })
    const response = await (await routes()).placeOrder(placeRequest())
    expect(response.status).toBe(422)
    expect((await response.json()).error).toEqual({
      code: 'refused',
      message: 'Pickup date is required',
      fieldErrors: [{ fieldName: 'pickup_date', message: 'Pickup date is required' }],
    })
  })

  it('a reward is refused (422) before any key is claimed', async () => {
    const response = await (await routes()).placeOrder(placeRequest(draft({ rewardId: 'r-1' })))
    expect(response.status).toBe(422)
    expect(index.claimOrderKey).not.toHaveBeenCalled()
  })

  it('a key still placing is 409', async () => {
    index.claimOrderKey.mockResolvedValue({ kind: 'placing', row: placedRow() })
    expect((await (await routes()).placeOrder(placeRequest())).status).toBe(409)
  })

  it('a burst of orders from one customer is rate limited', async () => {
    checkRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('app-orders:'), remaining: 0, retryAfterSec: 30 }))
    const response = await (await routes()).placeOrder(placeRequest())
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
  })

  it('an index outage answers unavailable, never 500', async () => {
    const { AppReadError } = jest.requireMock('@/lib/app-api/store-reads') as { AppReadError: new (m: string) => Error }
    index.claimOrderKey.mockRejectedValue(new AppReadError('down'))
    expect((await (await routes()).placeOrder(placeRequest())).status).toBe(503)
  })
})

describe('GET /api/app/v1/orders/[id]', () => {
  const get = async (id = 'order-1') => (await routes()).getOrder(request(`/api/app/v1/orders/${id}`), { params: Promise.resolve({ id }) })

  it('answers the caller’s own order with its live status', async () => {
    const response = await get()
    const body = appEnvelopeSchema(appOrderDetailSchema).parse(await response.json())
    expect(body.success && body.data).toMatchObject({ status: 'confirmed', paymentStatus: 'pending' })
    expect(index.getCustomerOrder).toHaveBeenCalledWith(TENANT, CUSTOMER, 'order-1')
    expect(fetchOrderTrackingContext).toHaveBeenCalledWith('order-1', 'tok-order-1', TENANT)
  })

  it('another customer’s order is 404', async () => {
    index.getCustomerOrder.mockResolvedValue(null)
    expect((await get('theirs')).status).toBe(404)
  })

  it('falls back to the snapshot when the live read fails', async () => {
    fetchOrderTrackingContext.mockRejectedValue(new Error('convex down'))
    const body = await (await get()).json()
    expect(body.data).toMatchObject({ status: 'pending', paymentStatus: 'unknown' })
  })

  it('needs a session', async () => {
    resolveCustomerSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})

describe('GET /api/app/v1/me/orders', () => {
  it('answers a page of the caller’s orders', async () => {
    const response = await (await routes()).myOrders(request('/api/app/v1/me/orders?cursor=abc'))
    const body = appEnvelopeSchema(appOrderPageSchema).parse(await response.json())
    expect(body.success && body.data.orders).toHaveLength(1)
    expect(index.listCustomerOrders).toHaveBeenCalledWith(TENANT, CUSTOMER, { cursor: 'abc' })
  })

  it('a bad cursor is 400', async () => {
    index.listCustomerOrders.mockResolvedValue({ ok: false, error: 'bad_cursor' })
    expect((await (await routes()).myOrders(request('/api/app/v1/me/orders?cursor=%%%'))).status).toBe(400)
  })
})

describe('POST /api/app/v1/vouchers/preview', () => {
  const body = { code: 'SAVE10', orderTypeId: PICKUP_TYPE, outletId: null, lines: draft().lines }

  beforeEach(() => {
    loadAndPriceOrderLines.mockImplementation(async (_db, _tenant, lines) => ({ ok: true, lines, itemsSubtotal: 260 }))
    priceOrderVouchers.mockImplementation(async (input) => {
      const [voucher] = await input.lookup.findByCodes(TENANT, ['SAVE10'])
      return { application: { applied: voucher ? [{ voucher, result: { amount: 26 } }] : [], rejected: [] } }
    })
  })

  it('answers what the code takes off the server-priced bag', async () => {
    findByCodes.mockResolvedValue([{ id: 'v-1', code: 'SAVE10', name: '10% off', isActive: true }])
    const response = await (await routes()).voucherPreview(request('/api/app/v1/vouchers/preview', { method: 'POST', body }))
    const parsed = appEnvelopeSchema(appVoucherPreviewSchema).parse(await response.json())
    expect(parsed.success && parsed.data).toEqual({ code: 'SAVE10', label: '10% off', isApplied: true, discount: 26, reason: null })
    expect(loadAndPriceOrderLines).toHaveBeenCalledWith(expect.anything(), TENANT, expect.any(Array), null, { modifierGroupsEnabled: false })
  })

  it('an unknown code is 404', async () => {
    findByCodes.mockResolvedValue([])
    expect((await (await routes()).voucherPreview(request('/api/app/v1/vouchers/preview', { method: 'POST', body }))).status).toBe(404)
  })

  it('a malformed request is 400', async () => {
    expect((await (await routes()).voucherPreview(request('/api/app/v1/vouchers/preview', { method: 'POST', body: { code: '' } }))).status).toBe(400)
  })
})
