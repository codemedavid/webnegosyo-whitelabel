/** @jest-environment node */
/**
 * POST /api/cash/remittances/[id]/accept-pin: the route's own job is the
 * prologue (body, id, who is calling, Bearer or cookie) and passing the
 * service's answer through with its status. The rules are tested in
 * remittance-pin.test.ts.
 */
import { NextRequest } from 'next/server'

const ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const RECEIVER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const mockCaller = jest.fn()
const mockAccept = jest.fn()
const mockStore = jest.fn()

jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: () => mockCaller() }))
jest.mock('@/lib/supabase/bearer-session', () => ({ withRequestBearer: (_request: unknown, handler: () => unknown) => handler() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ kind: 'service-role' }), ADMIN_QUERY_TIMEOUT_MS: 1 }))
jest.mock('@/lib/cash/remittance-pin-store', () => ({ createRemittancePinStore: (...args: unknown[]) => mockStore(...args) }))
jest.mock('@/lib/cash/remittance-pin', () => ({ acceptRemittanceByPin: (...args: unknown[]) => mockAccept(...args) }))

async function post(body: unknown, id = ID) {
  const { POST } = await import('@/app/api/cash/remittances/[id]/accept-pin/route')
  const request = new NextRequest(`http://localhost/api/cash/remittances/${id}/accept-pin`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
  })
  return POST(request, { params: Promise.resolve({ id }) })
}

const BODY = { receiverUserId: RECEIVER, pin: '1234', receivedCents: 634500 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockCaller.mockResolvedValue({
    user: { id: 'ana' },
    appUser: { role: 'admin', tenant_id: 't1', is_owner: false, outlet_id: 'o1', permissions: ['pos'] },
    roleError: null,
  })
  mockStore.mockReturnValue({ kind: 'store' })
})
afterEach(() => jest.restoreAllMocks())

describe('accept-pin route', () => {
  it('passes the caller and the body to the service and answers 200 with the row', async () => {
    mockAccept.mockResolvedValue({ ok: true, remittance: { id: ID, status: 'accepted' } })

    const response = await post({ ...BODY, note: 'ok' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ remittance: { id: ID, status: 'accepted' } })
    expect(mockStore).toHaveBeenCalledWith({ kind: 'service-role' }, 'ana')
    expect(mockAccept).toHaveBeenCalledWith(
      { kind: 'store' },
      { userId: 'ana', role: 'admin', tenantId: 't1', isOwner: false, outletId: 'o1' },
      { remittanceId: ID, receiverUserId: RECEIVER, pin: '1234', receivedCents: 634500, note: 'ok' },
    )
  })

  it.each([
    [422, { error: 'That PIN is not right. Try again.', triesLeft: 2 }],
    [423, { error: 'locked', lockedUntil: '2026-10-24T19:05:00.000Z' }],
    [412, { error: 'No PIN set — send to their phone instead.' }],
    [409, { error: 'already answered' }],
    [429, { error: 'Too many tries.' }],
  ])('passes a %i refusal through with its body', async (status, body) => {
    mockAccept.mockResolvedValue({ ok: false, status, body })

    const response = await post(BODY)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })

  it('is 401 without a signed-in user and 403 when the account read failed', async () => {
    mockCaller.mockResolvedValueOnce({ user: null, appUser: null, roleError: null })
    expect((await post(BODY)).status).toBe(401)

    mockCaller.mockResolvedValueOnce({ user: { id: 'ana' }, appUser: null, roleError: new Error('timeout') })
    expect((await post(BODY)).status).toBe(403)
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it('refuses a bad body or id before anything is read', async () => {
    expect((await post({ ...BODY, pin: '12' })).status).toBe(400)
    expect((await post({ ...BODY, receivedCents: 1.5 })).status).toBe(400)
    expect((await post({ ...BODY, extra: true })).status).toBe(400)
    expect((await post(BODY, 'not-an-id')).status).toBe(404)
    expect(mockCaller).not.toHaveBeenCalled()
  })

  it('is 500 with a plain sentence when the service throws', async () => {
    mockAccept.mockRejectedValue(new Error('connection reset'))

    const response = await post(BODY)

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toMatch(/connection/)
  })
})
