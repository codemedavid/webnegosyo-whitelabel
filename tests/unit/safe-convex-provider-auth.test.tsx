import { render } from '@testing-library/react'
import { ConvexReactClient } from 'convex/react'
import { SafeConvexProvider } from '@/components/shared/safe-convex-provider'

const mockGetSession = jest.fn()
const mockRefreshSession = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession, refreshSession: mockRefreshSession } }),
}))
jest.mock('convex/react', () => ({
  ConvexReactClient: jest.fn(() => ({ setAuth: jest.fn() })),
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
}))

function token(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
}

function tokenFetcher() {
  render(<SafeConvexProvider url={`https://auth-${Math.random()}.convex.cloud`}><p>Feature</p></SafeConvexProvider>)
  const client = jest.mocked(ConvexReactClient).mock.results.at(-1)!.value
  return client.setAuth.mock.calls[0][0] as (args: { forceRefreshToken: boolean }) => Promise<string | null>
}

beforeEach(() => jest.clearAllMocks())

it('refreshes the Supabase session when Convex requests a fresh token', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { access_token: token({ wn_role: 'admin', wn_tenant_id: 'store' }) } }, error: null })
  mockRefreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh-token' } }, error: null })
  expect(await tokenFetcher()({ forceRefreshToken: true })).toBe('fresh-token')
})

it('refreshes a cached token without merchant claims before the first query can use it', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { access_token: token({ sub: 'admin-user' }) } }, error: null })
  mockRefreshSession.mockResolvedValue({ data: { session: { access_token: 'token-with-current-claims' } }, error: null })
  expect(await tokenFetcher()({ forceRefreshToken: false })).toBe('token-with-current-claims')
})

it.each([
  { wn_role: 'admin', wn_tenant_id: 'store' },
  { wn_role: 'superadmin', wn_tenant_id: null },
])('reuses a current merchant token when refresh is not requested: %j', async claims => {
  const currentToken = token(claims)
  mockGetSession.mockResolvedValue({ data: { session: { access_token: currentToken } }, error: null })
  expect(await tokenFetcher()({ forceRefreshToken: false })).toBe(currentToken)
  expect(mockRefreshSession).not.toHaveBeenCalled()
})

it('keeps anonymous storefront sessions anonymous without attempting refresh', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  expect(await tokenFetcher()({ forceRefreshToken: true })).toBeNull()
  expect(mockRefreshSession).not.toHaveBeenCalled()
})

it('does not reuse stale credentials if refreshing fails', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { access_token: token({ sub: 'user' }) } }, error: null })
  mockRefreshSession.mockResolvedValue({ data: { session: null }, error: new Error('Refresh failed') })
  expect(await tokenFetcher()({ forceRefreshToken: false })).toBeNull()
})
