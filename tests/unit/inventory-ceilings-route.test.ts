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

const request = (query: string) =>
  new NextRequest(`http://localhost/api/inventory/ceilings${query}`)

beforeEach(() => {
  jest.clearAllMocks()
  getMenuStockAvailability.mockResolvedValue({
    dishes: new Map([['m-pizza', 5]]),
    options: new Map([['m-tea', new Map([['opt-pearls', 0]])]]),
  })
})

describe('GET /api/inventory/ceilings', () => {
  it('returns one ceiling per tracked dish', async () => {
    const response = await GET(request('?tenantId=t1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({ 'm-pizza': 5 })
  })

  it('returns, per dish, how many can be made with each recipe-tracked option', async () => {
    const body = await (await GET(request('?tenantId=t1'))).json()

    expect(body.optionCeilings).toEqual({ 'm-tea': { 'opt-pearls': 0 } })
  })

  it('rejects a request that names no tenant', async () => {
    const response = await GET(request(''))

    expect(response.status).toBe(400)
    expect(getMenuStockAvailability).not.toHaveBeenCalled()
  })

  it('passes the branch through so a stepper reflects that branch’s shelf', async () => {
    await GET(request('?tenantId=t1&outletId=branch-1'))

    expect(getMenuStockAvailability).toHaveBeenCalledWith('t1', 'branch-1')
  })

  it('treats a missing branch as store-wide', async () => {
    await GET(request('?tenantId=t1'))

    expect(getMenuStockAvailability).toHaveBeenCalledWith('t1', null)
  })

  it('answers with no ceilings rather than an error when the read throws', async () => {
    // A stepper that cannot load its cap must fall back to uncapped, exactly as
    // it behaved before this route existed — never to a broken menu.
    getMenuStockAvailability.mockRejectedValue(new Error('boom'))

    const response = await GET(request('?tenantId=t1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ceilings).toEqual({})
    expect(body.optionCeilings).toEqual({})
  })

  it('is not cached — a ceiling is stale the moment the next order lands', async () => {
    const response = await GET(request('?tenantId=t1'))

    expect(response.headers.get('cache-control')).toMatch(/no-store/)
  })
})
