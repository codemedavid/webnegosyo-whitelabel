/**
 * @jest-environment node
 *
 * Who may obtain ImageKit upload credentials: a tenant admin or superadmin,
 * identified by the web cookie session OR a Supabase access token from the
 * merchant app (`Authorization: Bearer ...`).
 */

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

interface FakeSession {
  user: { id: string } | null
  appUser: { role: string; tenant_id: string | null } | null
}

function fakeSupabase({ user, appUser }: FakeSession) {
  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(async () => ({ data: appUser, error: null }))
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user }, error: user ? null : new Error('no session') })) },
    from: jest.fn(() => builder),
  }
}

async function load() {
  const supabaseJs = await import('@supabase/supabase-js')
  const server = await import('@/lib/supabase/server')
  const { resolveImageKitUploader } = await import('@/lib/imagekit-uploader-auth')
  return {
    bearerClient: jest.mocked(supabaseJs.createClient),
    cookieClient: jest.mocked(server.createClient),
    resolveImageKitUploader,
  }
}

function request(headers: Record<string, string> = {}) {
  return new Request('https://www.webnegosyo.com/api/imagekit/auth', { headers })
}

describe('resolveImageKitUploader', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  })

  it('authorizes a merchant-app admin by bearer token', async () => {
    const { bearerClient, cookieClient, resolveImageKitUploader } = await load()
    bearerClient.mockReturnValue(fakeSupabase({ user: { id: 'u1' }, appUser: { role: 'admin', tenant_id: 't1' } }) as never)

    const result = await resolveImageKitUploader(request({ authorization: 'Bearer token-abc' }))

    expect(result).toEqual({ status: 'authorized', uploader: { userId: 'u1', role: 'admin', tenantId: 't1' } })
    expect(cookieClient).not.toHaveBeenCalled()
  })

  it('denies a bearer token that does not resolve to a user', async () => {
    const { bearerClient, resolveImageKitUploader } = await load()
    bearerClient.mockReturnValue(fakeSupabase({ user: null, appUser: null }) as never)

    const result = await resolveImageKitUploader(request({ authorization: 'Bearer forged' }))

    expect(result.status).toBe('denied')
  })

  it('authorizes a superadmin by web cookie session', async () => {
    const { cookieClient, resolveImageKitUploader } = await load()
    cookieClient.mockResolvedValue(fakeSupabase({ user: { id: 'u2' }, appUser: { role: 'superadmin', tenant_id: null } }) as never)

    const result = await resolveImageKitUploader(request({ cookie: 'sb-db-auth-token=abc' }))

    expect(result).toEqual({ status: 'authorized', uploader: { userId: 'u2', role: 'superadmin', tenantId: null } })
  })

  it('denies a signed-in user with no admin membership', async () => {
    const { cookieClient, resolveImageKitUploader } = await load()
    cookieClient.mockResolvedValue(fakeSupabase({ user: { id: 'u3' }, appUser: null }) as never)

    const result = await resolveImageKitUploader(request({ cookie: 'sb-db-auth-token=abc' }))

    expect(result.status).toBe('denied')
  })

  it('reports anonymous when no credentials are presented at all', async () => {
    const { cookieClient, resolveImageKitUploader } = await load()
    cookieClient.mockResolvedValue(fakeSupabase({ user: null, appUser: null }) as never)

    const result = await resolveImageKitUploader(request())

    expect(result.status).toBe('anonymous')
  })

  it('treats an unexpected auth error as denied, never authorized', async () => {
    const { cookieClient, resolveImageKitUploader } = await load()
    cookieClient.mockRejectedValue(new Error('db down'))

    const result = await resolveImageKitUploader(request({ cookie: 'sb-db-auth-token=abc' }))

    expect(result.status).toBe('denied')
  })
})

// A module, not a script: without this, top-level helpers collide across test files under tsc.
export {};
