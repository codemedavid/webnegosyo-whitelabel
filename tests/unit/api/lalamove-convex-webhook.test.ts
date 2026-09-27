/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lalamove-convex/route'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({ data: { convex_deployment_url: 'https://store.convex.cloud' }, error: null }),
      }
      return builder
    },
  }),
}))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'test-deploy-key' }),
}))

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
function request(body: unknown, secret = 'test-secret') {
  return new NextRequest(
    `https://example.test/api/lalamove-convex?secret=${secret}&tenant_id=${TENANT_ID}&order_id=order-1`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

beforeEach(() => {
  process.env.LALAMOVE_WEBHOOK_SECRET = 'test-secret'
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ status: 'success', value: true })))
})

test('rejects an unauthenticated webhook before accessing Convex', async () => {
  expect((await POST(request({ orderId: 'rider-1', status: 'ON_GOING' }, 'wrong'))).status).toBe(401)
  expect(fetch).not.toHaveBeenCalled()
})

test.each([
  { status: 'ON_GOING' },
  { orderId: '  ', status: 'ON_GOING' },
  { orderId: 'rider-1' },
  { orderId: 'rider-1', status: '  ' },
])('rejects a webhook with no usable provider ID or status: %p', async (body) => {
  expect((await POST(request(body))).status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})

test('binds webhook updates to the already recorded provider booking', async () => {
  const response = await POST(request({ orderId: 'rider-1', status: 'ON_GOING' }))
  expect(response.status).toBe(200)
  const [, init] = (fetch as jest.Mock).mock.calls[0]
  expect(JSON.parse(init.body).args).toMatchObject({
    orderId: 'order-1', lalamoveOrderId: 'rider-1', expectedLalamoveOrderId: 'rider-1',
  })
})

test('does not acknowledge a webhook rejected for a wrong provider ID or pending booking', async () => {
  ;(fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ status: 'success', value: false })))

  const response = await POST(request({ orderId: 'wrong-rider', status: 'CANCELLED' }))

  expect(response.status).toBe(409)
  await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/booking|changed/i) })
})

test.each([
  { status: 500, body: { error: 'Storage unavailable' } },
  { status: 200, body: { status: 'error', errorMessage: 'Storage unavailable' } },
  { status: 200, body: { status: 'success' } },
])('does not acknowledge a failed or unconfirmed Convex mutation: %p', async ({ status, body }) => {
  ;(fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(body), { status }))

  const response = await POST(request({ orderId: 'rider-1', status: 'ON_GOING' }))

  expect(response.status).toBe(500)
})
