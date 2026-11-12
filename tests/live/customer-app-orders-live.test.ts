/** @jest-environment node */
/**
 * LIVE check of the customer app's order routes against the real PLATFORM
 * database, on Beracah Cafe (the owner's dev store: platform backend, no
 * merchant devices, inventory off). Two throwaway app customers are created,
 * one real order is placed through POST /api/app/v1/orders exactly as the dev
 * build calls it (X-App-Id + Bearer cs1 session + Idempotency-Key), read back
 * through GET /orders/[id] and GET /me/orders, and then CANCELLED through the
 * merchant's own status writer (updateOrderStatus) — never deleted. The
 * throwaway accounts are removed with delete_customer_app_account.
 *
 *   CUSTOMER_APP_ORDERS_LIVE=1 npx jest tests/live/customer-app-orders-live.test.ts
 *
 * Only the request plumbing Next normally provides is stubbed: the data cache
 * (passthrough), cookies (none — an app request has none, so the checkout's
 * reads run as anon like in production) and Sentry. The cleanup's cancel runs
 * updateOrderStatus with the service role standing in for a signed-in staff
 * account (no staff credentials in a test).
 */
import { createHash, randomInt } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import type { NextRequest as NextRequestType } from 'next/server'

const isLive = process.env.CUSTOMER_APP_ORDERS_LIVE === '1'
const TENANT_ID = '770c5577-6693-4572-9538-463f716c3333'
const TENANT_SLUG = 'beracah-cafe'
const DEV_APP_ID = 'com.webnegosyo.customer.dev'
const TEST_NAME = 'TEST customer app'
const TEST_NOTE = 'TEST ORDER — customer app live check, cancelled automatically'
/** TEST-NET-3: never a real customer's address, so the per-IP buckets are ours alone. */
const TEST_IP = '203.0.113.77'

function loadEnv(): void {
  // A worktree's .env.local is a symlink to the main checkout's; fall back to it by path too.
  const candidates = [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '../../../.env.local')]
  const file = candidates.find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error('No .env.local found for the live run')
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  process.env.APP_DEV_TENANT_SLUG = TENANT_SLUG
  delete process.env.VERCEL_ENV
}

if (isLive) loadEnv()

/** Flipped only for the cleanup's cancel: the merchant writer then runs as staff (service role). */
const mockStaff = { isActive: false }

jest.mock('server-only', () => ({}))
// jest.setup.js stubs the cookie-bound Supabase client for unit tests; this run needs the real one.
jest.mock('@supabase/ssr', () => jest.requireActual('@supabase/ssr'))
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}))
jest.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}))
jest.mock('@/lib/supabase/server', () => {
  const actual = jest.requireActual('@/lib/supabase/server')
  return {
    ...actual,
    createClient: async () =>
      mockStaff.isActive ? jest.requireActual('@/lib/supabase/admin').createAdminClient() : actual.createClient(),
  }
})
jest.mock('@/lib/admin-service', () => ({
  ...jest.requireActual('@/lib/admin-service'),
  verifyTenantPermission: async () => {
    if (!mockStaff.isActive) throw new Error('No staff session in the live test')
    return { user: null }
  },
}))

const liveDescribe = isLive ? describe : describe.skip

interface TestCustomer {
  customerId: string
  token: string
}

interface Envelope {
  success: boolean
  data: unknown
  error: { code: string; message: string } | null
}

const admin = async () => (await import('@/lib/supabase/admin')).createAdminClient()

const fakePhone = () => `+63999${String(randomInt(0, 10_000_000)).padStart(7, '0')}`

/** A throwaway app account: the customer record, its app profile, and a session minted by the real token helpers. */
async function createTestCustomer(name: string): Promise<TestCustomer> {
  const db = await admin()
  const { createAppSessionToken } = await import('@/lib/customer-auth/session-token')
  const phone = fakePhone()
  const { data: customer, error } = await db
    .from('customers')
    .insert({ tenant_id: TENANT_ID, phone_e164: phone, created_source: 'app', name })
    .select('id')
    .single()
  if (error || !customer) throw new Error(`customer insert failed: ${error?.message}`)
  const customerId = (customer as { id: string }).id
  const profile = await db.from('customer_app_profiles').insert({ customer_id: customerId, tenant_id: TENANT_ID, display_name: name })
  if (profile.error) throw new Error(`profile insert failed: ${profile.error.message}`)
  const { token, tokenHash } = createAppSessionToken()
  const now = Date.now()
  const session = await db.from('customer_app_sessions').insert({
    tenant_id: TENANT_ID,
    customer_id: customerId,
    phone_hash: createHash('sha256').update(`live-test:${phone}`).digest('hex'),
    token_hash: tokenHash,
    expires_at: new Date(now + 60 * 86_400_000).toISOString(),
    absolute_expires_at: new Date(now + 365 * 86_400_000).toISOString(),
  })
  if (session.error) throw new Error(`session insert failed: ${session.error.message}`)
  return { customerId, token }
}

async function appRequest(pathname: string, token: string, init: { method?: string; body?: unknown; key?: string } = {}): Promise<NextRequestType> {
  const { NextRequest } = await import('next/server')
  const headers: Record<string, string> = {
    'x-app-id': DEV_APP_ID,
    authorization: `Bearer ${token}`,
    'x-forwarded-for': TEST_IP,
    ...(init.key ? { 'idempotency-key': init.key } : {}),
    ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
  }
  return new NextRequest(`http://localhost${pathname}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function readJson(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope
}

/** The merchant's own status writer, as staff. */
async function cancelOrder(orderId: string): Promise<void> {
  const { updateOrderStatus } = await import('@/lib/orders-service')
  mockStaff.isActive = true
  try {
    await updateOrderStatus(orderId, TENANT_ID, 'cancelled', { reason: 'Test order', note: 'customer app live check' })
  } finally {
    mockStaff.isActive = false
  }
}

/** A crashed earlier run must not leave a live test order on the store. */
async function cancelLeftoverTestOrders(): Promise<string[]> {
  const db = await admin()
  const since = new Date(Date.now() - 6 * 3_600_000).toISOString()
  const { data, error } = await db
    .from('orders')
    .select('id, status, customer_data')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .limit(50)
  if (error) throw new Error(`leftover scan failed: ${error.message}`)
  const leftovers = ((data ?? []) as Array<{ id: string; customer_data: Record<string, unknown> | null }>).filter(
    (row) => row.customer_data?.notes === TEST_NOTE || row.customer_data?.customer_name === TEST_NAME,
  )
  for (const row of leftovers) await cancelOrder(row.id)
  return leftovers.map((row) => row.id)
}

interface Picks {
  orderTypeId: string
  paymentMethodId: string | null
  paymentReference: string | null
  itemId: string
  selections: Record<string, Record<string, number>>
  expectedTotal: number
}

/** What a customer would pick, from the same reads the routes use. */
async function pickOrder(token: string): Promise<Picks> {
  const { readOrderTypes, readPaymentMethods } = await import('@/lib/checkout/load-checkout-config')
  const { createPublicClient } = await import('@/lib/supabase/public')
  const { chooseOrderType, offeredPaymentMethods } = await import('@/lib/app-api/orders/order-request')
  const { appCatalogSchema } = await import('@/lib/app-contract')
  const { GET: catalogRoute } = await import('@/app/api/app/v1/catalog/route')

  const orderTypes = await readOrderTypes(createPublicClient(), TENANT_ID)
  const orderType =
    orderTypes.map((row) => chooseOrderType(orderTypes, row.id)).find((type) => type?.kind === 'pickup') ??
    orderTypes.map((row) => chooseOrderType(orderTypes, row.id)).find((type) => type?.kind === 'dine_in')
  if (!orderType) throw new Error('The store offers no pickup or dine-in order type on the web')

  const offered = offeredPaymentMethods(await readPaymentMethods(createPublicClient(), TENANT_ID), orderType.id)
  const method = offered.find((candidate) => candidate.require_payment_proof !== true) ?? offered[0] ?? null

  const response = await catalogRoute(await appRequest('/api/app/v1/catalog', token))
  expect(response.status).toBe(200)
  const catalog = appCatalogSchema.parse((await readJson(response)).data)
  const byPrice = [...catalog.items].filter((item) => item.isAvailable).sort((a, b) => a.price - b.price)
  const item = byPrice.find((candidate) => candidate.modifierGroups.every((group) => group.minSelect === 0)) ?? byPrice[0]
  if (!item) throw new Error('The store has no available dish')

  const selections: Record<string, Record<string, number>> = {}
  let extras = 0
  for (const group of item.modifierGroups.filter((candidate) => candidate.minSelect > 0)) {
    const options = group.options.filter((option) => option.isAvailable).slice(0, group.minSelect)
    selections[group.id] = Object.fromEntries(options.map((option) => [option.id, 1]))
    extras += options.reduce((sum, option) => sum + option.priceDelta, 0)
  }
  return {
    orderTypeId: orderType.id,
    paymentMethodId: method?.id ?? null,
    paymentReference: method?.require_payment_proof === true ? 'TEST-REF-0001' : null,
    itemId: item.id,
    selections,
    expectedTotal: Math.round((item.price + extras) * 100) / 100,
  }
}

liveDescribe('customer app orders (live platform DB, beracah-cafe)', () => {
  const customers: TestCustomer[] = []
  const placedOrderIds: string[] = []

  beforeAll(async () => {
    const leftovers = await cancelLeftoverTestOrders()
    if (leftovers.length > 0) console.warn('[live] cancelled leftover test orders', leftovers)
    customers.push(await createTestCustomer(TEST_NAME), await createTestCustomer(`${TEST_NAME} B`))
  }, 30_000)

  afterAll(async () => {
    const db = await admin()
    for (const orderId of placedOrderIds) await cancelOrder(orderId)
    const { data: orders } = await db.from('orders').select('id, status').in('id', placedOrderIds.length > 0 ? placedOrderIds : ['00000000-0000-0000-0000-000000000000'])
    expect((orders ?? []).every((row) => (row as { status: string }).status === 'cancelled')).toBe(true)

    for (const customer of customers) {
      const { data, error } = await db.rpc('delete_customer_app_account', { p_tenant_id: TENANT_ID, p_customer_id: customer.customerId })
      expect(error).toBeNull()
      expect(data).toMatchObject({ ok: true })
      const [index, sessions, profiles] = await Promise.all([
        db.from('customer_app_orders').select('id').eq('tenant_id', TENANT_ID).eq('customer_id', customer.customerId),
        db.from('customer_app_sessions').select('id').eq('tenant_id', TENANT_ID).eq('customer_id', customer.customerId),
        db.from('customer_app_profiles').select('customer_id').eq('customer_id', customer.customerId),
      ])
      expect(index.data).toEqual([])
      expect(sessions.data).toEqual([])
      expect(profiles.data).toEqual([])
      // The account delete keeps a customer record an order points at; a throwaway one goes too (orders keep a NULL link).
      const removed = await db.from('customers').delete().eq('tenant_id', TENANT_ID).eq('id', customer.customerId)
      expect(removed.error).toBeNull()
    }
  }, 60_000)

  test('places, dedupes, reads back and lists an app order; another customer cannot read it', async () => {
    const { appEnvelopeSchema, appOrderDetailSchema, appOrderPageSchema } = await import('@/lib/app-contract')
    const { POST: placeRoute } = await import('@/app/api/app/v1/orders/route')
    const { GET: orderRoute } = await import('@/app/api/app/v1/orders/[id]/route')
    const { GET: myOrdersRoute } = await import('@/app/api/app/v1/me/orders/route')
    const db = await admin()
    const [customer, stranger] = customers
    const picks = await pickOrder(customer.token)
    const key = `live-${crypto.randomUUID()}`
    const draft = {
      orderTypeId: picks.orderTypeId,
      outletId: null,
      lines: [{ itemId: picks.itemId, quantity: 1, selections: picks.selections }],
      paymentMethodId: picks.paymentMethodId,
      paymentReference: picks.paymentReference,
      voucherCode: null,
      rewardId: null,
      delivery: null,
      notes: TEST_NOTE,
    }

    // Place
    const placed = await placeRoute(await appRequest('/api/app/v1/orders', customer.token, { method: 'POST', body: draft, key }))
    const placedBody = await readJson(placed)
    if (placed.status !== 201) console.error('[live] place refused', placed.status, placedBody.error)
    expect(placed.status).toBe(201)
    const detail = appEnvelopeSchema(appOrderDetailSchema).parse(placedBody)
    if (!detail.success) throw new Error('unreachable')
    const orderId = detail.data.id
    placedOrderIds.push(orderId)
    expect(detail.data.status).toBe('pending')
    expect(detail.data.totals.total).toBe(picks.expectedTotal)

    // The real order row
    const { data: orderRow, error: orderError } = await db
      .from('orders')
      .select('id, tenant_id, source, total, status, customer_data, client_order_id, payment_method_id')
      .eq('id', orderId)
      .single()
    expect(orderError).toBeNull()
    const order = orderRow as unknown as { tenant_id: string; source: string; total: number | string; status: string; customer_data: Record<string, unknown>; client_order_id: string; payment_method_id: string | null }
    expect(order.tenant_id).toBe(TENANT_ID)
    expect(order.source).toBe('mobile')
    expect(Number(order.total)).toBe(picks.expectedTotal)
    expect(order.status).toBe('pending')
    expect(order.client_order_id).toBe(key)
    expect(order.payment_method_id).toBe(picks.paymentMethodId)
    expect(order.customer_data).toMatchObject({ customer_name: TEST_NAME, customer_phone: expect.stringMatching(/^\+63999\d{7}$/), notes: TEST_NOTE })

    // The app's index row
    const { data: indexRows } = await db.from('customer_app_orders').select('state, order_id, summary, backend').eq('tenant_id', TENANT_ID).eq('idempotency_key', key)
    expect(indexRows).toHaveLength(1)
    const indexRow = (indexRows ?? [])[0] as { state: string; order_id: string; summary: Record<string, unknown> | null; backend: string }
    expect(indexRow).toMatchObject({ state: 'placed', order_id: orderId, backend: 'platform' })
    expect(indexRow.summary).toMatchObject({ totals: { total: picks.expectedTotal } })

    // Retry with the same key → the same order, never a second one
    const retried = await placeRoute(await appRequest('/api/app/v1/orders', customer.token, { method: 'POST', body: draft, key }))
    expect(retried.status).toBe(200)
    expect(((await readJson(retried)).data as { id: string }).id).toBe(orderId)
    const { data: sameKeyOrders } = await db.from('orders').select('id').eq('tenant_id', TENANT_ID).eq('client_order_id', key)
    expect(sameKeyOrders).toHaveLength(1)

    // Read it back
    const read = await orderRoute(await appRequest(`/api/app/v1/orders/${orderId}`, customer.token), { params: Promise.resolve({ id: orderId }) })
    expect(read.status).toBe(200)
    const readBody = appEnvelopeSchema(appOrderDetailSchema).parse(await readJson(read))
    expect(readBody.success && readBody.data).toMatchObject({ id: orderId, status: 'pending' })

    // History
    const list = await myOrdersRoute(await appRequest('/api/app/v1/me/orders', customer.token))
    expect(list.status).toBe(200)
    const page = appEnvelopeSchema(appOrderPageSchema).parse(await readJson(list))
    expect(page.success && page.data.orders.map((summary) => summary.id)).toContain(orderId)

    // Someone else's session never sees it
    const foreign = await orderRoute(await appRequest(`/api/app/v1/orders/${orderId}`, stranger.token), { params: Promise.resolve({ id: orderId }) })
    expect(foreign.status).toBe(404)
    const strangerList = await myOrdersRoute(await appRequest('/api/app/v1/me/orders', stranger.token))
    const strangerPage = appEnvelopeSchema(appOrderPageSchema).parse(await readJson(strangerList))
    expect(strangerPage.success && strangerPage.data.orders).toEqual([])

    console.info('[live] placed and verified app order', { orderId, key, total: picks.expectedTotal, paymentMethodId: picks.paymentMethodId })
  }, 90_000)
})
