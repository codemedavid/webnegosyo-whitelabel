/** @jest-environment node */
/**
 * POST /api/business-day/convex-sync: the merchant app changes the cutoff with
 * a direct RPC, so it asks the web to push the STORED schedule to a Convex
 * store's deployment (which numbers orders by it). Nothing the caller sends is
 * pushed; only who may ask is checked.
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const mockCaller = jest.fn()
const mockRateLimit = jest.fn()
const mockSync = jest.fn()

jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: () => mockCaller() }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/convex-config-sync', () => ({ syncTenantConvexConfig: (...args: unknown[]) => mockSync(...args) }))

const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null }

function post(body: unknown) {
  return new NextRequest('http://localhost/api/business-day/convex-sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
  })
}

async function route() {
  return import('@/app/api/business-day/convex-sync/route')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCaller.mockResolvedValue({ user: { id: 'u1' }, appUser: owner })
  mockRateLimit.mockResolvedValue({ allowed: true })
  mockSync.mockResolvedValue({ status: 'synced' })
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  ;(console.error as jest.Mock).mockRestore()
})

describe('POST /api/business-day/convex-sync', () => {
  it("pushes the store's stored schedule for an owner", async () => {
    const { POST } = await route()
    const response = await POST(post({ tenantId: TENANT }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'synced' })
    expect(mockSync).toHaveBeenCalledWith(TENANT)
  })

  it('answers skipped for a store with no Convex deployment', async () => {
    mockSync.mockResolvedValue({ status: 'skipped', reason: 'No Convex deployment URL' })
    const { POST } = await route()
    await expect((await POST(post({ tenantId: TENANT }))).json()).resolves.toEqual({ status: 'skipped' })
  })

  it('refuses a signed-out caller', async () => {
    mockCaller.mockResolvedValue({ user: null, appUser: null })
    const { POST } = await route()
    expect((await POST(post({ tenantId: TENANT }))).status).toBe(401)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it("refuses another store's id", async () => {
    const { POST } = await route()
    expect((await POST(post({ tenantId: OTHER }))).status).toBe(403)
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('refuses staff without the settings key (the cutoff is a settings change)', async () => {
    mockCaller.mockResolvedValue({ user: { id: 'u2' }, appUser: { ...owner, is_owner: false, permissions: ['pos'] } })
    const { POST } = await route()
    expect((await POST(post({ tenantId: TENANT }))).status).toBe(403)
  })

  it('refuses a malformed body', async () => {
    const { POST } = await route()
    expect((await POST(post({ tenantId: 'nope' }))).status).toBe(400)
    expect((await POST(post({ tenantId: TENANT, extra: 1 }))).status).toBe(400)
  })

  it('is rate limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false })
    const { POST } = await route()
    expect((await POST(post({ tenantId: TENANT }))).status).toBe(429)
  })

  it('reports a failed push as 502 without leaking the reason', async () => {
    mockSync.mockResolvedValue({ status: 'failed', error: 'Convex rejected the config write: secret detail' })
    const { POST } = await route()
    const response = await POST(post({ tenantId: TENANT }))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toMatch(/secret detail/)
  })
})
