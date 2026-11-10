/**
 * @jest-environment node
 *
 * Public reads with no account behind them: each counts per IP in the shared
 * limiter, and answers 429 without touching the database once over.
 */
import { NextRequest } from 'next/server'

const mockRateLimit = jest.fn()
const mockSlots = jest.fn()
const mockCalendar = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/booking/slots', () => ({ getAvailableSlots: (...args: unknown[]) => mockSlots(...args) }))
jest.mock('@/lib/presell/calendar-read', () => ({ getPresellCalendar: (...args: unknown[]) => mockCalendar(...args) }))

function get(path: string) {
  return new NextRequest(`https://www.webnegosyo.com${path}`, { headers: { 'x-real-ip': '203.0.113.7' } })
}

beforeEach(() => {
  mockRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 0 })
  mockSlots.mockReset().mockResolvedValue([])
  mockCalendar.mockReset().mockResolvedValue(new Map())
})

describe('/api/booking/slots', () => {
  it('counts per IP and refuses without reading once over', async () => {
    const { GET } = await import('@/app/api/booking/slots/route')
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })

    const res = await GET(get('/api/booking/slots?date=2026-11-09'))

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(mockRateLimit.mock.calls[0][0]).toBe('booking-slots:203.0.113.7')
    expect(mockSlots).not.toHaveBeenCalled()
  })

  it('refuses a date that is not YYYY-MM-DD', async () => {
    const { GET } = await import('@/app/api/booking/slots/route')
    expect((await GET(get('/api/booking/slots?date=2026-11-09T00:00:00Z&x'))).status).toBe(400)
    expect(mockSlots).not.toHaveBeenCalled()
  })

  it('still answers within the limit', async () => {
    const { GET } = await import('@/app/api/booking/slots/route')
    expect((await GET(get('/api/booking/slots?date=2026-11-09'))).status).toBe(200)
  })
})

describe('/api/presell/availability', () => {
  const PATH = '/api/presell/availability?tenantId=t1&menuItemId=m1'

  it('counts per IP and refuses without reading once over', async () => {
    const { GET } = await import('@/app/api/presell/availability/route')
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })

    const res = await GET(get(PATH))

    expect(res.status).toBe(429)
    expect(mockRateLimit.mock.calls[0][0]).toBe('presell-availability:203.0.113.7')
    expect(mockCalendar).not.toHaveBeenCalled()
  })

  it('still answers within the limit', async () => {
    const { GET } = await import('@/app/api/presell/availability/route')
    const res = await GET(get(PATH))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ calendar: {} })
  })
})
