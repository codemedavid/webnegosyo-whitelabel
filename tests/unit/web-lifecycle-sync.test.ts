import { notifyConvexLifecycleSync } from '@/lib/customers/web-lifecycle-sync'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
} }) }))

afterEach(() => jest.restoreAllMocks())

it('keeps the completion notification alive when the merchant leaves the page', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
  await notifyConvexLifecycleSync({ tenantId: 'tenant', externalOrderId: 'order', status: 'delivered' })
  expect(fetch).toHaveBeenCalledWith('/api/customers/sync-order-lifecycle', expect.objectContaining({ keepalive: true }))
})

it('reports a refused notification so it is not mistaken for a successful loyalty sync', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 })
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  await expect(notifyConvexLifecycleSync({ tenantId: 'tenant', externalOrderId: 'order', status: 'delivered' })).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not report'), expect.objectContaining({ message: expect.stringContaining('503') }))
})
