/**
 * @jest-environment node
 */
/**
 * Vercel invokes GET /api/loyalty/maintenance every minute with
 * `Authorization: Bearer $CRON_SECRET`. The handler used the unbounded
 * service-role client, swallowed the database error, and returned 503 —
 * so a stalled PostgREST became a 25s MIDDLEWARE_INVOCATION_TIMEOUT with
 * an empty log line.
 */
import { NextRequest } from 'next/server'

const mockRpc = jest.fn()
const mockCreateAdminClient = jest.fn((..._args: unknown[]) => ({ rpc: mockRpc }))
const mockProject = jest.fn()
const mockRefunds = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 8_000,
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}))
jest.mock('@/lib/loyalty/projection-worker', () => ({
  projectLoyaltyReceipts: (...args: unknown[]) => mockProject(...args),
}))
jest.mock('@/lib/loyalty/refund-reconciliation', () => ({
  reconcileLoyaltyRefunds: (...args: unknown[]) => mockRefunds(...args),
}))

const SECRET = 'cron-secret'
const request = (authorization?: string) =>
  new NextRequest('https://shop.test/api/loyalty/maintenance', {
    headers: authorization ? { authorization } : {},
  })

async function loadGet() {
  const { GET } = await import('@/app/api/loyalty/maintenance/route')
  return GET
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  mockRpc.mockReset().mockResolvedValue({ data: { expiredReservations: 0 }, error: null })
  mockCreateAdminClient.mockClear()
  mockProject.mockReset().mockResolvedValue({ completed: 0, retried: 0, unconfirmed: 0 })
  mockRefunds.mockReset().mockResolvedValue({ checked: 0, restored: 0, unconfirmed: 0 })
})

it('rejects a caller without the cron bearer token', async () => {
  const GET = await loadGet()
  expect((await GET(request())).status).toBe(401)
  expect(mockCreateAdminClient).not.toHaveBeenCalled()
})

it('rejects a wrong bearer token', async () => {
  const GET = await loadGet()
  expect((await GET(request('Bearer nope'))).status).toBe(401)
  expect(mockCreateAdminClient).not.toHaveBeenCalled()
})

it('runs cleanup, projections and refunds on the bounded admin client', async () => {
  const GET = await loadGet()
  const response = await GET(request(`Bearer ${SECRET}`))

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({
    success: true,
    expiredReservations: 0,
    projections: { completed: 0, retried: 0, unconfirmed: 0 },
    refunds: { checked: 0, restored: 0, unconfirmed: 0 },
  })
  expect(mockCreateAdminClient).toHaveBeenCalledWith({ timeoutMs: 8_000 })
  expect(mockRpc).toHaveBeenCalledWith('cleanup_loyalty_data')
  expect(mockProject).toHaveBeenCalledTimes(1)
  expect(mockRefunds).toHaveBeenCalledTimes(1)
})

it('logs the database error instead of swallowing it, and still fails closed', async () => {
  const logged = jest.spyOn(console, 'error').mockImplementation(() => {})
  mockRpc.mockResolvedValue({
    data: null,
    error: { message: 'canceling statement due to statement timeout', code: '57014' },
  })
  try {
    const GET = await loadGet()
    const response = await GET(request(`Bearer ${SECRET}`))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Loyalty maintenance failed.' })
    expect(JSON.stringify(await logged.mock.calls)).toContain('statement timeout')
    expect(mockProject).not.toHaveBeenCalled()
  } finally {
    logged.mockRestore()
  }
})
