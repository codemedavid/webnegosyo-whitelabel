/** @jest-environment node */
import { NextRequest } from 'next/server'

const limit = jest.fn()
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => limit(...args) }))
const resolve = jest.fn()
jest.mock('@/lib/maps/resolve-map-link', () => ({ resolveShortMapLink: (...args: unknown[]) => resolve(...args) }))

function post(body: unknown) {
  return new NextRequest('https://www.example.test/api/maps/resolve-link', { method: 'POST', body: JSON.stringify(body), headers: { 'x-real-ip': '1.2.3.4' } })
}

async function call(body: unknown) {
  const { POST } = await import('@/app/api/maps/resolve-link/route')
  return POST(post(body))
}

beforeEach(() => {
  limit.mockReset().mockResolvedValue({ allowed: true, retryAfterSec: 5 })
  resolve.mockReset().mockResolvedValue({ kind: 'point', point: { lat: 15.66, lng: 120.58 } })
})

describe('POST /api/maps/resolve-link', () => {
  it('looks up a Google short map link and never caches the answer', async () => {
    const response = await call({ url: 'https://maps.app.goo.gl/AbC123' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ location: { kind: 'point', point: { lat: 15.66, lng: 120.58 } } })
    expect(resolve).toHaveBeenCalledWith('https://maps.app.goo.gl/AbC123', expect.any(Function))
    expect(limit).toHaveBeenCalledWith('maps-resolve-link:1.2.3.4', expect.objectContaining({ limit: 30 }))
  })

  it.each([
    ['another host', 'http://169.254.169.254/latest/meta-data'],
    ['a full map link (read in the browser)', 'https://www.google.com/maps/@15.66,120.58,17z'],
    ['a non-map goo.gl link', 'https://goo.gl/AbC'],
    ['plain words', 'Camella Tanza'],
  ])('refuses %s without fetching anything', async (_label, url) => {
    const response = await call({ url })
    expect(response.status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('refuses an empty or oversized body', async () => {
    expect((await call({ url: '' })).status).toBe(400)
    expect((await call({ url: `https://maps.app.goo.gl/${'a'.repeat(600)}` })).status).toBe(400)
    expect((await call(null)).status).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('answers 429 once an address has asked too often', async () => {
    limit.mockResolvedValue({ allowed: false, retryAfterSec: 12 })
    const response = await call({ url: 'https://maps.app.goo.gl/AbC123' })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('answers "no location" when Google cannot be reached', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    resolve.mockRejectedValue(new Error('timeout'))
    const response = await call({ url: 'https://maps.app.goo.gl/AbC123' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ location: null })
    quiet.mockRestore()
  })
})
