/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/loyalty/settlements/route'

const tenantId = '11111111-1111-4111-8111-111111111111'
const quoteId = '22222222-2222-4222-8222-222222222222'
let mockUser: { id: string } | null
let mockMember: Record<string, unknown> | null
let mockQuote: Record<string, unknown> | null
let mockReadError: unknown
let mockAuthError: unknown
let mockMemberError: unknown
const mockRpc = jest.fn()
const mockQuoteFilters: Record<string, unknown> = {}

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: mockUser }, error: mockAuthError }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockMember, error: mockMemberError }) }) }) }),
}) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { mockQuoteFilters[key] = value; return query },
      maybeSingle: async () => ({ data: mockQuote, error: mockReadError }),
    }
    return query
  },
  rpc: (...args: unknown[]) => mockRpc(...args),
}) }))

function request(patch: Record<string, unknown> = {}, authorization = 'Bearer token') {
  return new NextRequest('https://example.test/api/loyalty/settlements', {
    method: 'POST', headers: { authorization },
    body: JSON.stringify({ tenantId, quoteId, clientOrderId: 'pos-sale-1',
      tender: { methodId: 'cash', amountTenderedCentavos: 10000 }, ...patch }),
  })
}

beforeEach(() => {
  process.env.LOYALTY_POS_SETTLEMENT_ENABLED = 'true'
  mockUser = { id: 'cashier' }
  mockMember = { role: 'admin', tenant_id: tenantId, permissions: ['pos', 'loyalty_redeem'], is_owner: false }
  mockQuote = { total_centavos: 8000, order_snapshot: { paymentPolicy: {
    totalCentavos: 8000, allowedMethods: [{ id: 'cash', kind: 'cash', requiresReference: false }],
  } } }
  mockReadError = null
  mockAuthError = null
  mockMemberError = null
  mockRpc.mockReset().mockResolvedValue({ data: { settlementId: 'receipt', clientOrderId: 'pos-sale-1',
    totalCentavos: 8000, settledAt: '2026-09-07T00:00:00Z' }, error: null })
  for (const key of Object.keys(mockQuoteFilters)) delete mockQuoteFilters[key]
})

afterAll(() => { delete process.env.LOYALTY_POS_SETTLEMENT_ENABLED })

it('settles the cashier-scoped frozen quote with normalized cash and server-calculated change', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, receipt: {
    settlementId: 'receipt', clientOrderId: 'pos-sale-1', totalCentavos: 8000, settledAt: '2026-09-07T00:00:00Z',
  } })
  expect(mockQuoteFilters).toEqual({ id: quoteId, tenant_id: tenantId, created_by: 'cashier' })
  expect(mockRpc).toHaveBeenCalledWith('settle_loyalty_pos_sale', {
    p_tenant_id: tenantId, p_quote_id: quoteId, p_client_order_id: 'pos-sale-1', p_actor: 'cashier',
    p_payment: { methodId: 'cash', kind: 'cash', amountTenderedCentavos: 10000, changeCentavos: 2000, reference: null },
  })
  expect(response.headers.get('cache-control')).toBe('no-store')
})

it('stays unavailable unless the deployment release gate is explicitly enabled', async () => {
  delete process.env.LOYALTY_POS_SETTLEMENT_ENABLED
  expect((await POST(request())).status).toBe(503)
  expect(mockRpc).not.toHaveBeenCalled()
})

it.each([
  { role: 'admin', tenant_id: 'other', permissions: null },
  { role: 'customer', tenant_id: tenantId, permissions: null },
  { role: 'admin', tenant_id: tenantId, permissions: ['pos'] },
  { role: 'admin', tenant_id: tenantId, permissions: ['loyalty_redeem'] },
  null,
])('requires merchant membership and both POS and redeem grants: %j', async (member) => {
  mockMember = member
  expect((await POST(request())).status).toBe(403)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('requires a valid bearer session', async () => {
  expect((await POST(request({}, ''))).status).toBe(401)
  mockUser = null
  expect((await POST(request())).status).toBe(401)
  expect(mockRpc).not.toHaveBeenCalled()
})

it.each([
  { totalCentavos: 1 }, { actor: 'owner' }, { quoteId: 'bad' },
  { clientOrderId: '' }, { clientOrderId: 'x'.repeat(129) }, { clientOrderId: ' with spaces ' },
])('rejects malformed IDs and client-authoritative fields: %j', async (patch) => {
  expect((await POST(request(patch))).status).toBe(400)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('returns a controlled error for malformed JSON and oversized requests', async () => {
  const malformed = new NextRequest('https://example.test/api/loyalty/settlements', {
    method: 'POST', headers: { authorization: 'Bearer token' }, body: '{',
  })
  expect((await POST(malformed)).status).toBe(400)
  expect((await POST(request({ extra: 'x'.repeat(17000) }))).status).toBe(413)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('does not settle a missing, legacy, or inconsistent frozen payment policy', async () => {
  for (const quote of [null, { total_centavos: 8000, order_snapshot: {} },
    { ...mockQuote, total_centavos: 1 }]) {
    mockQuote = quote
    expect([404, 409]).toContain((await POST(request())).status)
  }
  expect(mockRpc).not.toHaveBeenCalled()
})

it('rejects short cash before invoking settlement', async () => {
  expect((await POST(request({ tender: { methodId: 'cash', amountTenderedCentavos: 1 } }))).status).toBe(422)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('surfaces database failures without exposing database messages', async () => {
  mockReadError = { message: 'postgres credentials and internal details' }
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(JSON.stringify(await response.json())).not.toContain('postgres')
  expect(mockRpc).not.toHaveBeenCalled()
})

it.each([
  ['Idempotency key belongs to a different request', 409],
  ['Quote expired', 409], ['Forbidden branch', 403],
  ['Reward reservation expired or unavailable', 409],
  ['Live loyalty is not enabled', 409],
  ['private database diagnostic', 503],
])('maps SQL failure safely: %s', async (message, status) => {
  mockRpc.mockResolvedValue({ data: null, error: { message } })
  const response = await POST(request())
  expect(response.status).toBe(status)
  expect(await response.json()).not.toHaveProperty('success', true)
})

it('lets SQL replay the original receipt even after the quote expires', async () => {
  mockQuote = { ...mockQuote, expires_at: '2000-01-01T00:00:00Z' }
  expect((await POST(request())).status).toBe(200)
  expect((await POST(request())).status).toBe(200)
  expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1])
})

it('handles a lost commit acknowledgement without changing the retry identity', async () => {
  mockRpc.mockRejectedValueOnce(new Error('private connection information'))
  const failed = await POST(request())
  expect(failed.status).toBe(503)
  expect(await failed.json()).toEqual({ error: 'Settlement could not be confirmed. Retry with the same client order ID.' })
  expect((await POST(request())).status).toBe(200)
  expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1])
})

it('fails closed for authentication and membership database errors even alongside returned data', async () => {
  mockAuthError = { message: 'private diagnostic' }
  expect((await POST(request())).status).toBe(401)
  mockAuthError = null
  mockMemberError = { message: 'private diagnostic' }
  expect((await POST(request())).status).toBe(403)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('normalizes valid UUID case before comparing merchant membership', async () => {
  const tenantWithLetters = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  mockMember = { ...mockMember, tenant_id: tenantWithLetters }
  expect((await POST(request({ tenantId: tenantWithLetters.toUpperCase() }))).status).toBe(200)
  expect(mockQuoteFilters.tenant_id).toBe(tenantWithLetters)
})
