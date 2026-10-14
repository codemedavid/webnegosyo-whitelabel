/**
 * @jest-environment node
 */
/**
 * The public read behind a capped quantity stepper.
 *
 * Unauthenticated on purpose, and safe for the same reason
 * `/api/inventory/customer-order-stock` is: a diner has no account to gate on,
 * and the payload carries nothing steerable — a tenant and, optionally, a
 * branch. What comes back is one integer per dish, which is exactly what the
 * storefront is about to show that diner anyway. No ingredient, cost, supplier
 * or quantity ever crosses this boundary.
 */

import { GET } from '@/app/api/inventory/ceilings/route'
import { NextRequest } from 'next/server'

const getMenuStockCeilings = jest.fn()
jest.mock('@/lib/inventory/menu-ceilings', () => ({
  getMenuStockCeilings: (...a: unknown[]) => getMenuStockCeilings(...a),
}))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const BRANCH = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'

const request = (query: string) =>
  new NextRequest(`http://localhost/api/inventory/ceilings${query}`)

beforeEach(() => {
  jest.clearAllMocks()
  getMenuStockCeilings.mockResolvedValue(new Map([['m-pizza', 5]]))
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 100, retryAfterSec: 30 })
})

describe('GET /api/inventory/ceilings', () => {
  it('returns one ceiling per tracked dish', async () => {
    const response = await GET(request(`?tenantId=${TENANT}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({ 'm-pizza': 5 })
  })

  it('rejects a request that names no tenant', async () => {
    const response = await GET(request(''))

    expect(response.status).toBe(400)
    expect(getMenuStockCeilings).not.toHaveBeenCalled()
  })

  it('passes the branch through so a stepper reflects that branch’s shelf', async () => {
    await GET(request(`?tenantId=${TENANT}&outletId=${BRANCH}`))

    expect(getMenuStockCeilings).toHaveBeenCalledWith(TENANT, BRANCH)
  })

  it('treats a missing branch as store-wide', async () => {
    await GET(request(`?tenantId=${TENANT}`))

    expect(getMenuStockCeilings).toHaveBeenCalledWith(TENANT, null)
  })

  it('answers with no ceilings rather than an error when the read throws', async () => {
    // A stepper that cannot load its cap must fall back to uncapped, exactly as
    // it behaved before this route existed — never to a broken menu.
    getMenuStockCeilings.mockRejectedValue(new Error('boom'))

    const response = await GET(request(`?tenantId=${TENANT}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({})
  })

  it('is not cached — a ceiling is stale the moment the next order lands', async () => {
    const response = await GET(request(`?tenantId=${TENANT}`))

    expect(response.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('rejects a tenant or branch that is not an id, before touching the database', async () => {
    // Every call fans out into a whole-store stock graph read on the shared
    // database, so garbage never gets that far.
    for (const query of ['?tenantId=t1', `?tenantId=${TENANT}&outletId=branch-1`]) {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
    }
    expect(getMenuStockCeilings).not.toHaveBeenCalled()
  })

  it('refuses a caller over the per-address limit without reading stock', async () => {
    // Anyone can call this, and each call reads a store's whole stock graph,
    // so a loop must stop at the limit instead of at the database. A refusal
    // costs the diner nothing: the stepper falls back to uncapped.
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })

    const response = await GET(request(`?tenantId=${TENANT}`))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(getMenuStockCeilings).not.toHaveBeenCalled()
  })

  it('counts the limit per address and store, holding across instances', async () => {
    await GET(request(`?tenantId=${TENANT}`))

    const [key, options] = checkRateLimit.mock.calls[0] as [string, { onRedisFailure?: string }]
    expect(key).toContain(TENANT)
    expect(options.onRedisFailure).toBe('instance')
  })
})
