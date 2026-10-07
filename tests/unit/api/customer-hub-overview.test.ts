/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/customers/hub-overview/route'

let mockCaller = { role: 'admin', tenant_id: 'tenant', permissions: ['customers'], is_owner: false, outlet_id: 'branch-a' }
const mockFacts = jest.fn().mockResolvedValue({ facts: [], coverage: { complete: true } })
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockCaller }) }) }) }),
}) }))
let mockTenant: Record<string, unknown> = { id: 'tenant', customer_hub_enabled: true, order_backend: 'platform' }
const mockNameLookup = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => table === 'customers'
    ? { select: () => ({ eq: (_column: string, tenantId: string) => ({ in: (_c: string, ids: string[]) => mockNameLookup(tenantId, ids) }) }) }
    : { select: () => ({ eq: () => ({ single: async () => ({ data: mockTenant }) }) }) },
}) }))
jest.mock('@/lib/queries/customer-facts', () => ({ fetchCustomerOrderFacts: (...args: unknown[]) => mockFacts(...args) }))

function request(outletId?: string) {
  return new NextRequest('https://example.test/api/customers/hub-overview', {
    method: 'POST', headers: { authorization: 'Bearer token' },
    body: JSON.stringify({ tenantId: 'tenant', outletId }),
  })
}

beforeEach(() => {
  mockFacts.mockReset().mockResolvedValue({ facts: [], coverage: { complete: true } })
  mockNameLookup.mockReset().mockResolvedValue({ data: [], error: null })
  mockTenant = { id: 'tenant', customer_hub_enabled: true, order_backend: 'platform' }
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

it('serves a platform store even with the Customer Hub switch off', async () => {
  mockTenant = { id: 'tenant', customer_hub_enabled: false, order_backend: 'platform' }
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect((await response.json()).overview.dashboard.tillComplete).toBe(true)
})

it('still refuses a Convex store whose switch is off', async () => {
  mockTenant = { id: 'tenant', customer_hub_enabled: false, order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' }
  const response = await POST(request())
  expect(response.status).toBe(403)
  expect((await response.json()).error).toMatch(/not enabled/)
  expect(mockFacts).not.toHaveBeenCalled()
})

it('names the best customers from this store only', async () => {
  const at = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  mockFacts.mockResolvedValue({
    coverage: { complete: true },
    facts: [{
      backend: 'platform_supabase', externalOrderId: 'o1', customerId: 'ana', phoneE164: null,
      source: 'online', status: 'delivered', paymentStatus: 'paid', branchId: null, netTotal: 300,
      orderedAt: at, completedAt: at, updatedAt: at, items: [],
    }],
  })
  mockNameLookup.mockResolvedValue({ data: [{ id: 'ana', name: 'Ana Reyes' }], error: null })

  const body = await (await POST(request())).json()

  expect(mockNameLookup).toHaveBeenCalledWith('tenant', ['ana'])
  expect(body.overview.dashboard.windows[0].topCustomers[0]).toMatchObject({ customerId: 'ana', name: 'Ana Reyes' })
})

it('keeps the dashboard when the name lookup fails', async () => {
  const at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  mockFacts.mockResolvedValue({
    coverage: { complete: true },
    facts: [{
      backend: 'platform_supabase', externalOrderId: 'o1', customerId: 'ana', phoneE164: null,
      source: 'online', status: 'delivered', paymentStatus: 'paid', branchId: null, netTotal: 300,
      orderedAt: at, completedAt: at, updatedAt: at, items: [],
    }],
  })
  mockNameLookup.mockResolvedValue({ data: null, error: { message: 'boom' } })
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

  const response = await POST(request())

  expect(response.status).toBe(200)
  expect((await response.json()).overview.dashboard.windows[0].topCustomers[0].name).toBeNull()
  spy.mockRestore()
})
