/**
 * @jest-environment node
 *
 * The door of /api/approvals: who gets in, and that the body is validated and
 * the actor comes from the token — never from the client.
 */
import { NextRequest } from 'next/server'

jest.mock('server-only', () => ({}))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn(() => ({})), ADMIN_QUERY_TIMEOUT_MS: 8000 }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 1, retryAfterSec: 1 })) }))
jest.mock('@/lib/approvals/service', () => ({
  createApproval: jest.fn(async () => ({ status: 201, body: { success: true, data: { route: 'request' }, error: null } })),
  listApprovals: jest.fn(async () => ({ status: 200, body: { success: true, data: { requests: [] }, error: null } })),
  decideApproval: jest.fn(async () => ({ status: 200, body: { success: true, data: {}, error: null } })),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const BODY = {
  tenantId: TENANT, kind: 'refund', orderId: ORDER, reasonCode: 'wrong_item', idempotencyKey: 'sheet_12345678',
  payload: { scope: 'whole' }, requestedBy: 'u-owner',
}

async function setCaller(user: { id: string } | null, appUser: Record<string, unknown> | null) {
  const { createClient } = await import('@supabase/supabase-js')
  ;(createClient as unknown as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })) },
    from: jest.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.select = jest.fn(() => builder)
      builder.eq = jest.fn(() => builder)
      builder.maybeSingle = jest.fn(async () => ({ data: appUser, error: null }))
      return builder
    }),
  })
}

function post(body: unknown, auth = 'Bearer token-abc'): NextRequest {
  return new NextRequest('http://localhost/api/approvals', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/approvals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  })

  test('refuses a missing token with 401', async () => {
    await setCaller(null, null)
    const { POST } = await import('@/app/api/approvals/route')
    const response = await POST(post(BODY, ''))
    expect(response.status).toBe(401)
  })

  test('refuses another store with 403', async () => {
    await setCaller({ id: 'u-ana' }, { role: 'admin', tenant_id: 'other-store', is_owner: false, permissions: null })
    const { POST } = await import('@/app/api/approvals/route')
    expect((await POST(post(BODY))).status).toBe(403)
  })

  test('refuses platform staff (not a store account) even with stores grants', async () => {
    await setCaller({ id: 'u-staff' }, { role: 'platform_staff', tenant_id: null, platform_permissions: ['stores.view', 'stores.edit'] })
    const { POST } = await import('@/app/api/approvals/route')
    expect((await POST(post(BODY))).status).toBe(403)
  })

  test('refuses a superadmin WRITE (they may read, never move a store\'s money) (L3)', async () => {
    await setCaller({ id: 'u-super' }, { role: 'superadmin', tenant_id: null, is_owner: false, permissions: null })
    const { POST, GET } = await import('@/app/api/approvals/route')
    expect((await POST(post(BODY))).status).toBe(403)
    const read = await GET(new NextRequest(`http://localhost/api/approvals?tenantId=${TENANT}&status=pending`, { headers: { authorization: 'Bearer t' } }))
    expect(read.status).toBe(200)
  })

  test('rejects an invalid body with 400 before any auth work', async () => {
    await setCaller({ id: 'u-ana' }, { role: 'admin', tenant_id: TENANT })
    const { POST } = await import('@/app/api/approvals/route')
    const response = await POST(post({ ...BODY, reasonCode: 'spoiled' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, code: 'invalid_request' })
  })

  test('the actor is the token user, not anything in the body', async () => {
    await setCaller({ id: 'u-ana' }, { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['pos'], outlet_id: 'o-1' })
    const { POST } = await import('@/app/api/approvals/route')
    const response = await POST(post(BODY))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const { createApproval } = await import('@/lib/approvals/service')
    const ctx = (createApproval as jest.Mock).mock.calls[0][0]
    expect(ctx.actor).toEqual({ userId: 'u-ana', role: 'admin', isOwner: false, permissions: ['pos'], outletId: 'o-1' })
    expect(ctx.tenantId).toBe(TENANT)
  })

  test('rate limits per person', async () => {
    await setCaller({ id: 'u-ana' }, { role: 'admin', tenant_id: TENANT })
    const { checkRateLimit } = await import('@/lib/distributed-rate-limit')
    ;(checkRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 30 })
    const { POST } = await import('@/app/api/approvals/route')
    expect((await POST(post(BODY))).status).toBe(429)
    expect((checkRateLimit as jest.Mock).mock.calls[0][0]).toBe('approvals:u-ana')
  })
})

describe('POST /api/approvals/:id/decision', () => {
  test('rejects a non-uuid id', async () => {
    await setCaller({ id: 'u-marco' }, { role: 'admin', tenant_id: TENANT })
    const { POST } = await import('@/app/api/approvals/[id]/decision/route')
    const request = new NextRequest('http://localhost/api/approvals/x/decision', {
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: TENANT, decision: 'approve' }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(response.status).toBe(400)
  })
})
