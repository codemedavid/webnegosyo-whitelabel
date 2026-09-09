/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/customers/hub-overview/route'

let mockCaller = { role: 'admin', tenant_id: 'tenant', permissions: ['customers'], is_owner: false, outlet_id: 'branch-a' }
const mockFacts = jest.fn().mockResolvedValue({ facts: [], coverage: { complete: true } })
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockCaller }) }) }) }),
}) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
    id: 'tenant', customer_hub_enabled: true, order_backend: 'platform',
  } }) }) }) }),
}) }))
jest.mock('@/lib/queries/customer-facts', () => ({ fetchCustomerOrderFacts: (...args: unknown[]) => mockFacts(...args) }))

function request(outletId?: string) {
  return new NextRequest('https://example.test/api/customers/hub-overview', {
    method: 'POST', headers: { authorization: 'Bearer token' },
    body: JSON.stringify({ tenantId: 'tenant', outletId }),
  })
}

beforeEach(() => {
  mockFacts.mockClear()
  mockCaller = { role: 'admin', tenant_id: 'tenant', permissions: ['customers'], is_owner: false, outlet_id: 'branch-a' }
})

it('confines branch staff even if they request another branch or omit a branch', async () => {
  for (const requested of [undefined, 'branch-b']) {
    expect((await POST(request(requested))).status).toBe(200)
    expect(mockFacts).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      outletId: 'branch-a', includeLifetime: true,
    }))
  }
})

it('allows the owner to select another branch', async () => {
  mockCaller.is_owner = true
  expect((await POST(request('branch-b'))).status).toBe(200)
  expect(mockFacts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outletId: 'branch-b' }))
})

it('denies POS-only staff and does not load customer history', async () => {
  mockCaller.permissions = ['pos']
  expect((await POST(request())).status).toBe(403)
  expect(mockFacts).not.toHaveBeenCalled()
})
