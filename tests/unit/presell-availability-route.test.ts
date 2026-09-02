/**
 * @jest-environment node
 */
/**
 * The public read behind the presell calendar.
 *
 * Unauthenticated for the same reason `/api/inventory/ceilings` is: a diner has
 * no account, and the payload carries nothing steerable — a tenant and a dish.
 * What comes back is one integer per date, which is exactly what the picker is
 * about to render. Nothing else crosses this boundary.
 *
 * Unlike ceilings, a FAILED read must not fall back to "unlimited": for a
 * presell dish, no calendar means nothing is sellable. An empty map is the
 * safe shape here, and the checkout guard remains the authoritative refusal.
 */

import { GET } from '@/app/api/presell/availability/route'
import { NextRequest } from 'next/server'

const getPresellCalendar = jest.fn()
jest.mock('@/lib/presell/calendar-read', () => ({
  getPresellCalendar: (...a: unknown[]) => getPresellCalendar(...a),
}))

const request = (query: string) =>
  new NextRequest(`http://localhost/api/presell/availability${query}`)

beforeEach(() => {
  jest.clearAllMocks()
  getPresellCalendar.mockResolvedValue(new Map([['2026-12-24', 15], ['2026-12-25', 0]]))
})

describe('GET /api/presell/availability', () => {
  it('returns remaining stock per date, zeros included', async () => {
    const response = await GET(request('?tenantId=t1&menuItemId=m-bilao'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.calendar).toEqual({ '2026-12-24': 15, '2026-12-25': 0 })
    expect(getPresellCalendar).toHaveBeenCalledWith('t1', 'm-bilao')
  })

  it('rejects a request missing the tenant or the dish', async () => {
    expect((await GET(request('?menuItemId=m-bilao'))).status).toBe(400)
    expect((await GET(request('?tenantId=t1'))).status).toBe(400)
  })

  it('never lets a stale calendar be cached', async () => {
    const response = await GET(request('?tenantId=t1&menuItemId=m-bilao'))
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns an empty calendar, not an error, when the read fails', async () => {
    getPresellCalendar.mockRejectedValue(new Error('boom'))
    const response = await GET(request('?tenantId=t1&menuItemId=m-bilao'))
    expect(response.status).toBe(200)
    expect((await response.json()).calendar).toEqual({})
  })
})

describe('getPresellCalendar (server read)', () => {
  const from = jest.fn()
  jest.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({ from }),
  }))

  function chain(rows: unknown[] | null, error: unknown = null) {
    const result = Promise.resolve({ data: rows, error })
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'order']) builder[method] = jest.fn(() => builder)
    builder.then = result.then.bind(result)
    return builder
  }

  beforeEach(() => {
    jest.resetModules()
    jest.unmock('@/lib/presell/calendar-read')
    from.mockReset()
  })

  it('reads only this dish for this tenant and drops dates before today', async () => {
    from.mockImplementation(() =>
      chain([
        { menu_item_id: 'm-bilao', presell_date: '2000-01-01', stock_qty: 5, sold_qty: 0 },
        { menu_item_id: 'm-bilao', presell_date: '2999-12-24', stock_qty: 20, sold_qty: 5 },
      ]),
    )
    const { getPresellCalendar: read } = await import('@/lib/presell/calendar-read')

    const calendar = await read('t1', 'm-bilao')

    expect(from).toHaveBeenCalledWith('presell_stock')
    expect(calendar.get('2999-12-24')).toBe(15)
    expect(calendar.has('2000-01-01')).toBe(false)
  })

  it('throws on a read error so the route can answer empty on purpose', async () => {
    from.mockImplementation(() => chain(null, { message: 'down' }))
    const { getPresellCalendar: read } = await import('@/lib/presell/calendar-read')
    await expect(read('t1', 'm-bilao')).rejects.toThrow('down')
  })
})
