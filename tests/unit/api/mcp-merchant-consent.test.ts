/** @jest-environment node */

import { GET, POST } from '@/app/api/mcp/oauth/authorize/route'

const mockIssueCode = jest.fn()
let mockRole = { role: 'admin', tenant_id: 'tenant-a', permissions: ['store_setup'], is_owner: false }
let mockUser: { id: string } | null = { id: 'user-a' }
let mockEnabled = true
const CALLBACK = 'https://untrusted-client.example/callback'
let mockPending: Array<Record<string, unknown>> = []
function mockCodeQuery() {
  let matches = [...mockPending]
  let update: Record<string, unknown> = {}
  const query = {
    insert: async (row: Record<string, unknown>) => {
      mockPending.push({ id: String(mockPending.length), consumed_at: null, ...row })
      return { error: null }
    },
    update: (patch: Record<string, unknown>) => { update = patch; return query },
    eq: (key: string, value: unknown) => { matches = matches.filter(row => row[key] === value); return query },
    is: (key: string, value: unknown) => { matches = matches.filter(row => row[key] === value); return query },
    gt: (key: string, value: string) => { matches = matches.filter(row => String(row[key]) > value); return query },
    select: () => query,
    maybeSingle: async () => {
      const row = matches[0]
      if (row) Object.assign(row, update)
      return { data: row ?? null, error: null }
    },
  }
  return query
}
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => table === 'mcp_oauth_codes' ? mockCodeQuery() : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { client_id: 'client', client_name: '<script>attack()</script>', redirect_uris: [CALLBACK] }, error: null,
  }) }) }) }) }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockRole }) }) }) }),
  }),
}))
jest.mock('@/lib/mcp/merchant-gate', () => ({
  ...jest.requireActual('@/lib/mcp/merchant-gate'),
  isTenantMcpEnabled: async () => mockEnabled,
}))
jest.mock('@/lib/mcp/oauth-service', () => ({
  ...jest.requireActual('@/lib/mcp/oauth-service'),
  issueAuthorizationCode: (...args: unknown[]) => mockIssueCode(...args),
}))

function requestUrl() {
  const url = new URL('https://store.example/api/mcp/oauth/authorize')
  url.search = new URLSearchParams({ response_type: 'code', client_id: 'client', redirect_uri: CALLBACK,
    code_challenge: 'challenge', code_challenge_method: 'S256', scope: 'tenant_admin offline_access', state: 'opaque-state' }).toString()
  return url.toString()
}

async function consent() {
  const response = await GET(new Request(requestUrl()))
  const html = await response.text()
  const token = html.match(/name="consent_token" value="([^"]+)"/)?.[1] ?? ''
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { response, html, token, cookie }
}

async function decide(options: { decision?: string; origin?: string; cookie?: string; token?: string; url?: string } = {}) {
  return POST(new Request(options.url ?? requestUrl(), {
    method: 'POST',
    headers: { origin: options.origin ?? 'https://store.example', cookie: options.cookie ?? '' },
    body: new URLSearchParams({ decision: options.decision ?? 'approve', consent_token: options.token ?? '' }),
  }))
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://store.example'
  mockPending = []
  mockIssueCode.mockReset().mockResolvedValue('one-time-code')
  mockRole = { role: 'admin', tenant_id: 'tenant-a', permissions: ['store_setup'], is_owner: false }
  mockUser = { id: 'user-a' }
  mockEnabled = true
})

it('shows consent for a registered third-party client without granting from a logged-in GET', async () => {
  const { response, html, token, cookie } = await consent()
  expect(response.status).toBe(200)
  expect(mockIssueCode).not.toHaveBeenCalled()
  expect(html).toContain(CALLBACK)
  expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(token).not.toBe('')
  expect(cookie).not.toBe('')
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(mockPending[0].scope).toBe('pending_consent')
  expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict')
})

it('issues a tenant-bound PKCE code only after approval and preserves OAuth state', async () => {
  const { token, cookie } = await consent()
  const response = await decide({ token, cookie })
  expect(response.status).toBe(303)
  const redirect = new URL(response.headers.get('location')!)
  expect(redirect.origin).toBe(new URL(CALLBACK).origin)
  expect(redirect.searchParams.get('code')).toBe('one-time-code')
  expect(redirect.searchParams.get('state')).toBe('opaque-state')
  expect(mockIssueCode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    clientId: 'client', tenantId: 'tenant-a', userId: 'user-a', codeChallenge: 'challenge', codeChallengeMethod: 'S256',
  }), expect.anything())
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
})

it('returns access_denied without issuing a code when declined', async () => {
  const { token, cookie } = await consent()
  const response = await decide({ token, cookie, decision: 'deny' })
  expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe('access_denied')
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it.each(['https://attacker.example', 'null', ''])('rejects a cross-origin consent POST from %s', async origin => {
  const { token, cookie } = await consent()
  expect((await decide({ token, cookie, origin })).status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it.each(['missing', 'mismatched', 'changed request', 'changed session'])('rejects %s consent binding', async mode => {
  const { token, cookie } = await consent()
  if (mode === 'changed session') mockUser = { id: 'other-user' }
  const response = await decide({ token: mode === 'mismatched' ? 'f'.repeat(64) : token,
    cookie: mode === 'missing' ? '' : cookie,
    url: mode === 'changed request' ? `${requestUrl()}&extra=changed` : undefined })
  expect(response.status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it('rechecks the tenant feature flag on approval', async () => {
  const { token, cookie } = await consent()
  mockEnabled = false
  expect((await decide({ token, cookie })).status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it.each(['approve', 'deny'])('consumes %s consent only once', async decision => {
  const { token, cookie } = await consent()
  expect((await decide({ token, cookie, decision })).status).toBe(303)
  expect((await decide({ token, cookie })).status).toBe(403)
  expect(mockIssueCode).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0)
})

it('refuses expired consent even when an old browser cookie is replayed', async () => {
  const { token, cookie } = await consent()
  mockPending[0].expires_at = new Date(Date.now() - 1000).toISOString()
  expect((await decide({ token, cookie })).status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it('ignores attacker-controlled forwarding headers during consent origin checks', async () => {
  const { token, cookie } = await consent()
  const response = await POST(new Request(requestUrl(), {
    method: 'POST', headers: { origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', cookie },
    body: new URLSearchParams({ decision: 'approve', consent_token: token }),
  }))
  expect(response.status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

it('moves consent to the configured canonical origin before setting its cookie', async () => {
  const response = await GET(new Request(requestUrl().replace('https://store.example', 'https://alias.example')))
  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe(requestUrl())
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(mockPending).toEqual([])
})

it('does not let restricted staff mint full merchant credentials through OAuth', async () => {
  mockRole.permissions = ['orders']
  const response = await GET(new Request(requestUrl()))
  expect(response.status).toBe(403)
  expect(mockIssueCode).not.toHaveBeenCalled()
})

// Client registration is open, so a registered redirect_uri proves nothing
// about who controls it. Redirecting a visitor there on a malformed request,
// before anyone has logged in, turned this endpoint into an open redirector
// (RFC 9700 §4.11.2). Those errors are answered locally instead.
it.each([
  ['response_type', 'token'],
  ['code_challenge', ''],
  ['code_challenge_method', 'md5'],
  ['scope', 'everything'],
])('answers a bad %s locally instead of redirecting an unauthenticated visitor', async (param, value) => {
  mockUser = null
  const url = new URL(requestUrl())
  url.searchParams.set(param, value)

  const response = await GET(new Request(url.toString()))

  expect(response.status).toBe(400)
  expect(response.headers.get('location')).toBeNull()
})
