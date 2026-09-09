/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { NextRequest } from 'next/server'
import { POST, DELETE } from '@/app/api/loyalty/sms-devices/route'

const tenantId = '11111111-1111-4111-8111-111111111111'
const deviceId = '33333333-3333-4333-8333-333333333333'
let mockUser: { id: string } | null
let mockMember: Record<string, unknown> | null
let mockAuthError: unknown
let mockMemberError: unknown
const mockRpc = jest.fn()

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: mockUser }, error: mockAuthError }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockMember, error: mockMemberError }) }) }) }),
}) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}) }))

function request(method: 'POST' | 'DELETE', body: unknown, authorization = 'Bearer token') {
  return new NextRequest('https://example.test/api/loyalty/sms-devices', {
    method, headers: { authorization }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  mockUser = { id: 'owner' }
  mockMember = { role: 'admin', tenant_id: tenantId, permissions: [], is_owner: true }
  mockAuthError = null
  mockMemberError = null
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
})

afterAll(() => { delete process.env.LOYALTY_SMS_DELIVERY_ENABLED })

describe('enrollment', () => {
  it('mints a server-generated device ID and credential, storing only the hash', async () => {
    const response = await POST(request('POST', { tenantId }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.device.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(body.device.credential).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    const [name, args] = mockRpc.mock.calls[0]
    expect(name).toBe('enroll_loyalty_sms_device')
    expect(args).toEqual({
      p_tenant_id: tenantId, p_actor_id: 'owner', p_device_id: body.device.deviceId,
      p_credential_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(JSON.stringify(args)).not.toContain(body.device.credential)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('stays unavailable unless the delivery release gate is explicitly enabled', async () => {
    delete process.env.LOYALTY_SMS_DELIVERY_ENABLED
    expect((await POST(request('POST', { tenantId }))).status).toBe(503)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    { role: 'admin', tenant_id: tenantId, permissions: null, is_owner: false },
    { role: 'admin', tenant_id: tenantId, permissions: ['loyalty_manage'], is_owner: false },
    { role: 'admin', tenant_id: 'other', permissions: null, is_owner: true },
    { role: 'customer', tenant_id: tenantId, permissions: null, is_owner: true },
    null,
  ])('only the store owner or a superadmin may enroll: %j', async (member) => {
    mockMember = member
    expect((await POST(request('POST', { tenantId }))).status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('lets a superadmin enroll for any tenant', async () => {
    mockMember = { role: 'superadmin', tenant_id: null, permissions: null, is_owner: false }
    expect((await POST(request('POST', { tenantId }))).status).toBe(200)
  })

  it('requires a valid bearer session', async () => {
    expect((await POST(request('POST', { tenantId }, ''))).status).toBe(401)
    mockUser = null
    expect((await POST(request('POST', { tenantId }))).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    {}, { tenantId: 'nope' }, { tenantId, deviceId }, { tenantId, extra: 1 }, [], 'text',
  ])('rejects malformed bodies: %j', async (body) => {
    expect((await POST(request('POST', body))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('reports a refused enrollment without leaking why', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    const response = await POST(request('POST', { tenantId }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Device enrollment was refused.' })
  })

  it('does not return a credential when the database call fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const response = await POST(request('POST', { tenantId }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('connection reset')
  })
})

describe('revocation', () => {
  it('revokes the named device for the tenant', async () => {
    const response = await DELETE(request('DELETE', { tenantId, deviceId }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith('revoke_loyalty_sms_device', {
      p_tenant_id: tenantId, p_actor_id: 'owner', p_device_id: deviceId,
    })
  })

  it('requires ownership and a device ID', async () => {
    mockMember = { role: 'admin', tenant_id: tenantId, permissions: null, is_owner: false }
    expect((await DELETE(request('DELETE', { tenantId, deviceId }))).status).toBe(403)
    mockMember = { role: 'admin', tenant_id: tenantId, permissions: null, is_owner: true }
    expect((await DELETE(request('DELETE', { tenantId }))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('reports a refused revocation as forbidden', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    expect((await DELETE(request('DELETE', { tenantId, deviceId }))).status).toBe(403)
  })
})
