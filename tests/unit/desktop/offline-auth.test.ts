const mockLookup = jest.fn()
const mockSession = jest.fn()
jest.mock('../../../webnegosyo-desktop/src/renderer/src/lib/supabase', () => ({
  supabase: { auth: { getSession: () => mockSession() }, from: () => ({ select: () => ({ eq: () => ({ in: () => ({ single: () => mockLookup() }) }) }) }) },
}))
import { useAuthStore } from '../../../webnegosyo-desktop/src/renderer/src/stores/auth-store'

beforeEach(() => {
  mockSession.mockResolvedValue({ data: { session: { user: { id: 'user' } } } })
  Object.assign(window, { api: { getPosTenant: jest.fn().mockResolvedValue({ userId: 'user', tenantId: 'tenant', convexUrl: 'https://one.convex.cloud' }) } })
  useAuthStore.setState({ isAuthenticated: false, isLoading: true })
})

it('does not restore cached access after the server denies a merchant lookup', async () => {
  mockLookup.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
  await useAuthStore.getState().restore()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(window.api.getPosTenant).not.toHaveBeenCalled()
})

it('still restores cached access when the merchant lookup is unreachable', async () => {
  mockLookup.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
  await useAuthStore.getState().restore()
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
})

it('provides the merchant token to Convex and bounds a stalled session read', async () => {
  const { fetchConvexToken } = await import('../../../webnegosyo-desktop/src/renderer/src/lib/convex-auth')
  mockSession.mockResolvedValueOnce({ data: { session: { access_token: 'merchant-token' } } })
  await expect(fetchConvexToken()).resolves.toBe('merchant-token')
  jest.useFakeTimers()
  try {
    mockSession.mockImplementationOnce(() => new Promise(() => {}))
    const token = fetchConvexToken()
    await jest.advanceTimersByTimeAsync(5000)
    await expect(token).resolves.toBeNull()
  } finally {
    jest.useRealTimers()
  }
})
