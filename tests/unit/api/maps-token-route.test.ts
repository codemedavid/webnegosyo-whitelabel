/**
 * @jest-environment node
 */
/**
 * GET /api/maps/token — the MapKit JS authorization callback.
 *
 * Public by necessity (every storefront checkout loads a map), so the token is
 * bound to the page origin, only issued for hosts this platform serves, and
 * the endpoint is rate limited per IP.
 */

import { generateKeyPairSync } from 'node:crypto'
import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ getClientIP: jest.fn(() => '10.0.0.1') }))
jest.mock('@/lib/tenant-domains', () => ({ domainDirectory: { lookup: jest.fn(async () => null) } }))

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const ENV_KEYS = ['APPLE_MAPKIT_TEAM_ID', 'APPLE_MAPKIT_KEY_ID', 'APPLE_MAPKIT_PRIVATE_KEY'] as const

function request(host: string) {
  return new NextRequest(`https://${host}/api/maps/token`, { headers: { host } })
}

async function loadRoute() {
  const { checkRateLimit } = await import('@/lib/distributed-rate-limit')
  const route = await import('@/app/api/maps/token/route')
  return { GET: route.GET, checkRateLimit: jest.mocked(checkRateLimit) }
}

function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.APPLE_MAPKIT_TEAM_ID = 'TEAM123456'
  process.env.APPLE_MAPKIT_KEY_ID = 'KEY1234567'
  process.env.APPLE_MAPKIT_PRIVATE_KEY = PEM
})

afterAll(() => {
  ENV_KEYS.forEach((key) => delete process.env[key])
})

it('issues a short-lived token bound to the storefront origin, never cached', async () => {
  const { GET, checkRateLimit } = await loadRoute()
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSec: 60 })

  const response = await GET(request('seacook.webnegosyo.com'))

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const payload = payloadOf(await response.text())
  expect(payload.iss).toBe('TEAM123456')
  expect(payload.origin).toBe('https://seacook.webnegosyo.com')
  expect(Number(payload.exp) - Number(payload.iat)).toBe(30 * 60)
})

it('refuses a host the platform does not serve', async () => {
  const { GET, checkRateLimit } = await loadRoute()
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSec: 60 })

  const response = await GET(request('evil.example'))

  expect(response.status).toBe(403)
})

it('answers 503 while MapKit is not configured, so the field degrades to plain text', async () => {
  delete process.env.APPLE_MAPKIT_PRIVATE_KEY
  const { GET, checkRateLimit } = await loadRoute()
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSec: 60 })

  const response = await GET(request('seacook.webnegosyo.com'))

  expect(response.status).toBe(503)
})

it('rate limits per IP', async () => {
  const { GET, checkRateLimit } = await loadRoute()
  checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })

  const response = await GET(request('seacook.webnegosyo.com'))

  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('12')
  expect(checkRateLimit).toHaveBeenCalledWith('maps-token:10.0.0.1', expect.objectContaining({ limit: 60 }))
})
