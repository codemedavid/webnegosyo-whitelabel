/**
 * The tracking read needs the tenant's routing row before it knows where the
 * order lives — two round trips in a row on the first paint after checkout and
 * on every poll. When this runtime already knows the store's backend (a hint
 * from an earlier routing read, or the SSR page's cached tenant row), the
 * likely read leaves WITH the routing read.
 *
 * The hint never routes: the fresh routing row still decides, and a guessed
 * read that turns out wrong is discarded. A correct hint costs no extra query.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)

const ORDER_ROW = {
  id: ORDER_ID, status: 'preparing', total: 250, delivery_fee: 0, service_charge_amount: 0,
  order_type: 'Counter', order_type_id: null, customer_name: 'Ana', customer_contact: '09171234567',
  outlet_id: null, source: 'online', payment_status: 'pending', created_at: '2026-09-21T10:00:00.000Z',
  daily_number: 7, scheduled_for: null, customer_data: {}, prep_minutes: null, promised_ready_at: null,
  order_type_row: null, order_items: [],
}

interface Pending { table: string; resolve: (value: { data: unknown; error: unknown }) => void }

let pending: Pending[] = []
let secretsCalls = 0

function deferredAdminClient() {
  return {
    from: (table: string) => {
      let resolveRead: Pending['resolve'] = () => {}
      const promise = new Promise<{ data: unknown; error: unknown }>((resolve) => { resolveRead = resolve })
      pending.push({ table, resolve: (value) => resolveRead(value) })
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        single: () => promise,
        maybeSingle: () => promise,
      }
      return builder
    },
  }
}

const convexQuery = jest.fn<(name: string, args: unknown) => Promise<unknown>>()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => deferredAdminClient() }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: () => ({ query: convexQuery }) }))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => {
    secretsCalls += 1
    return { convex_deploy_key: 'deploy-key' }
  },
}))
jest.mock('@/lib/tracking-token', () => ({ verifyTrackingToken: () => true, MIN_TRACKING_TOKEN_HEX: 20 }))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function modules() {
  const hint = await import('@/lib/order-tracking-backend-hint')
  const service = await import('@/lib/order-tracking-service')
  return { ...hint, ...service }
}

function settle(table: string, value: { data: unknown; error: unknown }) {
  const read = pending.find((entry) => entry.table === table)
  if (!read) throw new Error(`no pending ${table} read`)
  pending = pending.filter((entry) => entry !== read)
  read.resolve(value)
}

describe('tracking backend hint', () => {
  beforeEach(async () => {
    pending = []
    secretsCalls = 0
    convexQuery.mockReset()
    const { clearTrackingBackendHints } = await modules()
    clearTrackingBackendHints()
  })

  it('without a hint, reads the routing row first and the order after it', async () => {
    // Arrange
    const { fetchOrderTrackingData } = await modules()

    // Act
    const result = fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
    await flush()

    // Assert
    expect(pending.map((read) => read.table)).toEqual(['tenants'])
    settle('tenants', { data: { order_backend: 'platform', convex_deployment_url: null }, error: null })
    await flush()
    settle('orders', { data: ORDER_ROW, error: null })
    await expect(result).resolves.toMatchObject({ error: null, data: { status: 'preparing' } })
  })

  it('remembers the backend, so the next platform read leaves with the routing read', async () => {
    // Arrange — a first read teaches the hint.
    const { fetchOrderTrackingData } = await modules()
    const first = fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
    await flush()
    settle('tenants', { data: { order_backend: 'platform' }, error: null })
    await flush()
    settle('orders', { data: ORDER_ROW, error: null })
    await first

    // Act
    const second = fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
    await flush()

    // Assert — both reads in flight together, and still only two queries.
    expect(pending.map((read) => read.table)).toEqual(['tenants', 'orders'])
    settle('orders', { data: { ...ORDER_ROW, status: 'ready' }, error: null })
    settle('tenants', { data: { order_backend: 'platform' }, error: null })
    await expect(second).resolves.toMatchObject({ error: null, data: { status: 'ready' } })
    expect(pending).toHaveLength(0)
  })

  it('a stale platform hint never routes: the fresh routing row sends the read to Convex', async () => {
    // Arrange
    const { fetchOrderTrackingData, primeTrackingBackendHint } = await modules()
    primeTrackingBackendHint(TENANT_ID, { order_backend: 'platform' })
    convexQuery.mockResolvedValue({
      status: 'confirmed', items: [], total: 100, orderType: 'Pickup', customerName: 'Ana',
      _creationTime: Date.parse('2026-09-21T10:00:00.000Z'),
    })

    // Act
    const result = fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
    await flush()
    settle('orders', { data: ORDER_ROW, error: null }) // the guessed read — must be ignored
    settle('tenants', { data: { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }, error: null })

    // Assert
    await expect(result).resolves.toMatchObject({ error: null, data: { status: 'confirmed' } })
    expect(convexQuery).toHaveBeenCalledWith('orders:getOrderByIdInternal', { orderId: ORDER_ID })
  })

  it('a Convex hint starts the deploy-key read alongside the routing read', async () => {
    // Arrange
    const { fetchOrderTrackingData, primeTrackingBackendHint } = await modules()
    primeTrackingBackendHint(TENANT_ID, { convex_deployment_url: 'https://x.convex.cloud' })
    convexQuery.mockResolvedValue({ status: 'confirmed', items: [], total: 100, _creationTime: 0 })

    // Act
    const result = fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
    await flush()

    // Assert
    expect(secretsCalls).toBe(1)
    settle('tenants', { data: { order_backend: 'auto', convex_deployment_url: 'https://x.convex.cloud' }, error: null })
    await expect(result).resolves.toMatchObject({ error: null })
    expect(secretsCalls).toBe(1)
  })

  it('priming never overwrites a hint learned from a fresh routing read', async () => {
    // Arrange
    const { rememberTrackingBackend, primeTrackingBackendHint, recallTrackingBackend } = await modules()
    rememberTrackingBackend(TENANT_ID, 'convex')

    // Act
    primeTrackingBackendHint(TENANT_ID, { order_backend: 'platform' })

    // Assert
    expect(recallTrackingBackend(TENANT_ID)).toBe('convex')
  })

  it('keeps the hint store bounded', async () => {
    // Arrange
    const { rememberTrackingBackend, recallTrackingBackend, MAX_TRACKING_BACKEND_HINTS } = await modules()

    // Act
    for (let i = 0; i <= MAX_TRACKING_BACKEND_HINTS; i += 1) rememberTrackingBackend(`tenant-${i}`, 'platform')

    // Assert — the oldest entry was evicted, the newest kept.
    expect(recallTrackingBackend('tenant-0')).toBeNull()
    expect(recallTrackingBackend(`tenant-${MAX_TRACKING_BACKEND_HINTS}`)).toBe('platform')
  })
})
