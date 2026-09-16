/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/loyalty/projections/route'
const mockRpc = jest.fn()
let mockPermissions: string[] = []
const mockEq = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mockRpc, from: () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { mockEq(...args); return query }, in: () => query, order: () => query, limit: async () => ({ data: [], error: null }) }
  return query
} }) }))
jest.mock('@/lib/loyalty/merchant-http', () => ({ ...jest.requireActual('@/lib/loyalty/merchant-http'), authenticateMerchant: async () => ({ ok: true, userId: 'actor', member: { role: 'admin', is_owner: false, permissions: mockPermissions } }) }))
const id = '11111111-1111-4111-8111-111111111111'
const request = () => new NextRequest('https://shop.test/api/loyalty/projections', { method: 'POST', body: JSON.stringify({ tenantId: id, jobId: id }) })
beforeEach(() => { mockPermissions = ['loyalty_manage']; mockRpc.mockReset().mockResolvedValue({ data: true, error: null }); mockEq.mockClear() })
it('scopes sync visibility and retry to the authenticated tenant and actor', async () => {
  expect((await GET(new NextRequest(`https://shop.test/api/loyalty/projections?tenantId=${id}`))).status).toBe(200)
  expect(mockEq).toHaveBeenCalledWith('tenant_id', id)
  expect((await POST(request())).status).toBe(200)
  expect(mockRpc).toHaveBeenCalledWith('retry_loyalty_pos_projection', { p_tenant_id: id, p_actor: 'actor', p_job_id: id })
})
it('refuses ordinary POS cashiers without program management permission', async () => {
  mockPermissions = ['pos', 'loyalty_redeem']
  expect((await POST(request())).status).toBe(403)
  expect(mockRpc).not.toHaveBeenCalled()
})
