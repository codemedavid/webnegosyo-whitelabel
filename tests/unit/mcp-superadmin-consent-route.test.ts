/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

const createClient = jest.fn(async () => ({ client: true }))
const decideSuperadminConsent = jest.fn(async () => ({ kind: 'forbidden' as const }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

jest.mock('@/lib/mcp/superadmin-consent', () => ({
  ...jest.requireActual('@/lib/mcp/superadmin-consent'),
  decideSuperadminConsent: (...args: unknown[]) => decideSuperadminConsent(...(args as [])),
}))

import { POST } from '@/app/api/mcp/supabase/decision/route'

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

function decisionRequest(
  origin?: string,
  authorizationId = 'auth_1',
): Request {
  const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' })
  if (origin !== undefined) headers.set('origin', origin)

  return new Request('https://www.webnegosyo.com/api/mcp/supabase/decision', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ authorization_id: authorizationId, decision: 'approve' }),
  })
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://webnegosyo.com'
  jest.clearAllMocks()
})

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

describe('POST /api/mcp/supabase/decision origin gate', () => {
  it('accepts only the exact configured SmartMenu site origin', async () => {
    const response = await POST(decisionRequest('https://www.webnegosyo.com'))

    expect(response.status).toBe(403)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(decideSuperadminConsent).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing Origin before reading the Supabase session', async () => {
    const response = await POST(decisionRequest())

    expect(response.status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
    expect(decideSuperadminConsent).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example',
    'https://tenant.webnegosyo.com',
    'https://webnegosyo.com',
    'http://www.webnegosyo.com',
  ])('rejects foreign or sibling origin %s before reading the Supabase session', async (origin) => {
    const response = await POST(decisionRequest(origin))

    expect(response.status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
    expect(decideSuperadminConsent).not.toHaveBeenCalled()
  })

  it('rejects a malformed authorization ID before creating the Supabase client', async () => {
    const response = await POST(
      decisionRequest('https://www.webnegosyo.com', '../auth_1?decision=approve'),
    )

    expect(response.status).toBe(400)
    expect(createClient).not.toHaveBeenCalled()
    expect(decideSuperadminConsent).not.toHaveBeenCalled()
  })
})
