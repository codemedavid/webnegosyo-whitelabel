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

const getMenuStockAvailability = jest.fn()
jest.mock('@/lib/inventory/menu-ceilings', () => ({
  getMenuStockAvailability: (...a: unknown[]) => getMenuStockAvailability(...a),
}))

const readPosStockPolicy = jest.fn()
jest.mock('@/lib/inventory/pos-stock-policy', () => ({
  DEFAULT_POS_STOCK_POLICY: 'warn',
  readPosStockPolicy: (...a: unknown[]) => readPosStockPolicy(...a),
}))

const checkRateLimit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))

const requireBearerStoreCaller = jest.fn()
jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: (...a: unknown[]) => requireBearerStoreCaller(...a),
}))

const readThroughCeilingsCache = jest.fn()
jest.mock('@/lib/inventory/ceilings-cache', () => ({
  readThroughCeilingsCache: (...a: unknown[]) => readThroughCeilingsCache(...a),
}))

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const BRANCH = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'

const request = (query: string) =>
  new NextRequest(`http://localhost/api/inventory/ceilings${query}`)

beforeEach(() => {
  jest.clearAllMocks()
  getMenuStockAvailability.mockResolvedValue({
    dishes: new Map([['m-pizza', 5]]),
    options: new Map([['m-tea', new Map([['opt-pearls', 0]])]]),
  })
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 100, retryAfterSec: 30 })
  readPosStockPolicy.mockResolvedValue('warn')
  readThroughCeilingsCache.mockImplementation((_tenant: string, _outlet: string | null, read: () => Promise<unknown>) => read())
})

describe('GET /api/inventory/ceilings', () => {
  it('a diner’s menu read goes through the short per-branch cache', async () => {
    readThroughCeilingsCache.mockResolvedValueOnce({ ceilings: { 'm-cached': 2 }, optionCeilings: {}, stockPolicy: 'warn' })

    const body = await (await GET(request(`?tenantId=${TENANT}&outletId=${BRANCH}`))).json()

    expect(body.ceilings).toEqual({ 'm-cached': 2 })
    expect(readThroughCeilingsCache).toHaveBeenCalledWith(TENANT, BRANCH, expect.any(Function))
    expect(getMenuStockAvailability).not.toHaveBeenCalled()
  })

  it('the register (a Bearer token) always reads the shelf fresh', async () => {
    requireBearerStoreCaller.mockResolvedValue({ ok: true, user: { id: 'u-1' } })
    const withToken = new NextRequest(`http://localhost/api/inventory/ceilings?tenantId=${TENANT}`, {
      headers: { authorization: 'Bearer token-1' },
    })

    await GET(withToken)

    expect(readThroughCeilingsCache).not.toHaveBeenCalled()
    expect(getMenuStockAvailability).toHaveBeenCalledWith(TENANT, null)
  })

  it('returns one ceiling per tracked dish', async () => {
    const response = await GET(request(`?tenantId=${TENANT}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({ 'm-pizza': 5 })
  })

  it('returns, per dish, how many can be made with each recipe-tracked option', async () => {
    const body = await (await GET(request(`?tenantId=${TENANT}`))).json()

    expect(body.optionCeilings).toEqual({ 'm-tea': { 'opt-pearls': 0 } })
  })

  describe('stockPolicy — what the register does when stock runs short (contract)', () => {
    it('answers the store’s policy', async () => {
      readPosStockPolicy.mockResolvedValue('block')

      const body = await (await GET(request(`?tenantId=${TENANT}`))).json()

      expect(body.stockPolicy).toBe('block')
      expect(readPosStockPolicy).toHaveBeenCalledWith(TENANT)
    })

    it('answers warn by default', async () => {
      const body = await (await GET(request(`?tenantId=${TENANT}`))).json()

      expect(body.stockPolicy).toBe('warn')
    })

    it('still answers warn when the stock read fails', async () => {
      getMenuStockAvailability.mockRejectedValue(new Error('boom'))
      readPosStockPolicy.mockResolvedValue('block')

      const body = await (await GET(request(`?tenantId=${TENANT}`))).json()

      // A failed read never blocks a sale: nothing to compare against.
      expect(body).toEqual({ ceilings: {}, optionCeilings: {}, stockPolicy: 'warn' })
    })

    it('never reads the policy for a refused request', async () => {
      await GET(request(''))

      expect(readPosStockPolicy).not.toHaveBeenCalled()
    })
  })

  it('rejects a request that names no tenant', async () => {
    const response = await GET(request(''))

    expect(response.status).toBe(400)
    expect(getMenuStockAvailability).not.toHaveBeenCalled()
  })

  it('passes the branch through so a stepper reflects that branch’s shelf', async () => {
    await GET(request(`?tenantId=${TENANT}&outletId=${BRANCH}`))

    expect(getMenuStockAvailability).toHaveBeenCalledWith(TENANT, BRANCH)
  })

  it('treats a missing branch as store-wide', async () => {
    await GET(request(`?tenantId=${TENANT}`))

    expect(getMenuStockAvailability).toHaveBeenCalledWith(TENANT, null)
  })

  it('answers with no ceilings rather than an error when the read throws', async () => {
    // A stepper that cannot load its cap must fall back to uncapped, exactly as
    // it behaved before this route existed — never to a broken menu.
    getMenuStockAvailability.mockRejectedValue(new Error('boom'))

    const response = await GET(request(`?tenantId=${TENANT}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({})
    expect(body.optionCeilings).toEqual({})
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
    expect(getMenuStockAvailability).not.toHaveBeenCalled()
  })

  it('answers 429 past the per-address allowance, without reading stock', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })

    const response = await GET(request(`?tenantId=${TENANT}`))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(getMenuStockAvailability).not.toHaveBeenCalled()
  })

  it('counts the limit per address and store, holding across instances', async () => {
    await GET(request(`?tenantId=${TENANT}`))

    const [key, options] = checkRateLimit.mock.calls[0] as [string, { onRedisFailure?: string }]
    expect(key).toContain(TENANT)
    expect(options.onRedisFailure).toBe('instance')
  })

  describe('a signed-in register is counted per person, not per address', () => {
    // A busy shop's diners and its register share one Wi-Fi address; the
    // register must not run out of allowance because the dining room is busy.
    const withBearer = (query: string, ip = '203.0.113.7') =>
      new NextRequest(`http://localhost/api/inventory/ceilings${query}`, {
        headers: { authorization: 'Bearer token-abc', 'x-real-ip': ip },
      })

    const keys = () => checkRateLimit.mock.calls.map(([key]) => key as string)

    it('keys the limit on the store member’s user id', async () => {
      requireBearerStoreCaller.mockResolvedValue({ ok: true, user: { id: 'user-42' } })

      await GET(withBearer(`?tenantId=${TENANT}`))

      expect(requireBearerStoreCaller).toHaveBeenCalledWith(expect.anything(), TENANT, 'view')
      const key = keys()[keys().length - 1]
      expect(key).toContain('user-42')
      expect(key).toContain(TENANT)
      expect(key).not.toContain('203.0.113.7')
    })

    it('falls back to the address when the token is not a member of this store', async () => {
      requireBearerStoreCaller.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })

      const response = await GET(withBearer(`?tenantId=${TENANT}`))

      expect(response.status).toBe(200)
      const key = keys()[keys().length - 1]
      expect(key).toContain('203.0.113.7')
      expect(key).toContain(TENANT)
    })

    it('never verifies anything for an anonymous diner', async () => {
      await GET(request(`?tenantId=${TENANT}`))

      expect(requireBearerStoreCaller).not.toHaveBeenCalled()
      expect(checkRateLimit).toHaveBeenCalledTimes(1)
    })

    describe('a token is never verified without first being counted by address', () => {
      // Verifying a token is a GoTrue round trip plus an app_users read; a
      // stream of junk tokens must not buy unlimited verification.
      it('counts the address BEFORE verifying the token, then the person after', async () => {
        const order: string[] = []
        checkRateLimit.mockImplementation(async (key: string) => {
          order.push(`rate:${key}`)
          return { allowed: true, remaining: 100, retryAfterSec: 30 }
        })
        requireBearerStoreCaller.mockImplementation(async () => {
          order.push('verify')
          return { ok: true, user: { id: 'user-42' } }
        })

        await GET(withBearer(`?tenantId=${TENANT}`))

        expect(order).toHaveLength(3)
        expect(order[0]).toMatch(/^rate:.*203\.0\.113\.7/)
        expect(order[1]).toBe('verify')
        expect(order[2]).toMatch(/^rate:.*user-42/)
      })

      it('answers 429 without verifying once the address is over its allowance', async () => {
        checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 7 })

        const response = await GET(withBearer(`?tenantId=${TENANT}`))

        expect(response.status).toBe(429)
        expect(response.headers.get('retry-after')).toBe('7')
        expect(requireBearerStoreCaller).not.toHaveBeenCalled()
        expect(getMenuStockAvailability).not.toHaveBeenCalled()
      })

      it('keeps the address count for tokens apart from the diners’ allowance, and not per store', async () => {
        requireBearerStoreCaller.mockResolvedValue({ ok: true, user: { id: 'user-42' } })

        await GET(withBearer(`?tenantId=${TENANT}`))

        const [first, options] = checkRateLimit.mock.calls[0] as [string, { onRedisFailure?: string }]
        expect(first).not.toBe(`stock-ceilings:203.0.113.7:${TENANT}`)
        expect(first).not.toContain(TENANT) // rotating store ids buys no extra verifications
        expect(options.onRedisFailure).toBe('instance')
      })
    })
  })
})
