import { AppApiError } from '@/lib/api/app-client'
import { queryClient, queryKeys } from '@/lib/data/hooks'
import { useCart } from '@/lib/stores/cart'
import { useSession } from '@/lib/stores/session'

const mockAuth = {
  requestCode: jest.fn(),
  verifyCode: jest.fn(),
  getProfile: jest.fn(),
  updateName: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
}
jest.mock('./auth-source', () => ({ createLiveAuth: () => mockAuth, createPrototypeAuth: () => mockAuth }))

const stored = { token: null as string | null }
jest.mock('./session-storage', () => ({
  loadSessionToken: async () => stored.token,
  saveSessionToken: async (token: string) => {
    stored.token = token
  },
  clearSessionToken: async () => {
    stored.token = null
  },
}))

// Loaded after the mocks above exist (imports would run before these consts are initialised).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the mocks are initialised
const actions = (): typeof import('./account-actions') => require('./account-actions')

const PROFILE = { name: 'Angelo', phoneE164: '+639171234567' }
const TOKEN = `cs1.${'a'.repeat(43)}`

function seedPreviousCustomer() {
  queryClient.setQueryData(queryKeys.loyalty, { memberCode: 'WNLC1.previous' })
  queryClient.setQueryData(queryKeys.orders, [{ id: 'theirs' }])
  useCart.getState().add({ lineId: 'l1', itemId: 'i1', name: 'Latte', imageUrl: null, selections: {}, optionLabels: [], quantity: 1, unitCentavos: 14500 })
}

const hasCustomerData = () =>
  queryClient.getQueryData(queryKeys.loyalty) !== undefined || queryClient.getQueryData(queryKeys.orders) !== undefined || useCart.getState().lines.length > 0

beforeEach(() => {
  jest.clearAllMocks()
  stored.token = null
  useSession.setState({ status: 'guest', token: null, profile: null })
})

describe('account actions', () => {
  it('signing in drops the previous person’s rewards, orders and bag, and keeps the session', async () => {
    useSession.setState({ status: 'member', token: `cs1.${'b'.repeat(43)}`, profile: { name: 'Someone', phoneE164: '+639181112222' } })
    seedPreviousCustomer()
    const needsName = await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: PROFILE })
    expect(needsName).toBe(false)
    expect(hasCustomerData()).toBe(false)
    expect(useSession.getState()).toMatchObject({ status: 'member', token: TOKEN, profile: PROFILE })
    expect(stored.token).toBe(TOKEN)
  })

  it('a guest who signs in to check out keeps their bag (live: bag emptied on the simulator, 2026-11-12)', async () => {
    useCart.getState().clear()
    useCart.getState().add({ lineId: 'mine', itemId: 'i1', name: 'Latte', imageUrl: null, selections: {}, optionLabels: [], quantity: 2, unitCentavos: 14500 })
    queryClient.setQueryData(queryKeys.loyalty, { memberCode: 'WNLC1.stale' })
    await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: PROFILE })
    expect(useCart.getState().lines.map((line) => [line.lineId, line.quantity])).toEqual([['mine', 2]])
    expect(queryClient.getQueryData(queryKeys.loyalty)).toBeUndefined()
  })

  it('asks for a name for a new customer or one who never gave it', async () => {
    expect(await actions().completeSignIn({ token: TOKEN, isNewCustomer: true, profile: PROFILE })).toBe(true)
    expect(await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: { ...PROFILE, name: null } })).toBe(true)
  })

  it('signing out forgets everything locally even if the server call fails', async () => {
    await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: PROFILE })
    seedPreviousCustomer()
    mockAuth.signOut.mockRejectedValue(new AppApiError('unavailable', 'offline'))
    await actions().signOut()
    expect(useSession.getState().status).toBe('guest')
    expect(stored.token).toBeNull()
    expect(hasCustomerData()).toBe(false)
    expect(mockAuth.signOut).toHaveBeenCalledWith(TOKEN)
  })

  it('delete account stays signed in when the store did not confirm', async () => {
    await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: PROFILE })
    mockAuth.deleteAccount.mockRejectedValueOnce(new AppApiError('unavailable', 'Try again'))
    await expect(actions().deleteAccount()).rejects.toMatchObject({ code: 'unavailable' })
    expect(useSession.getState().status).toBe('member')
    mockAuth.deleteAccount.mockResolvedValueOnce(undefined)
    await actions().deleteAccount()
    expect(useSession.getState().status).toBe('guest')
    expect(stored.token).toBeNull()
  })

  it('a refused session on any call signs the phone out', async () => {
    await actions().completeSignIn({ token: TOKEN, isNewCustomer: false, profile: PROFILE })
    mockAuth.updateName.mockRejectedValue(new AppApiError('unauthorized', 'Please sign in again.'))
    await expect(actions().saveName('New')).rejects.toMatchObject({ code: 'unauthorized' })
    expect(useSession.getState().status).toBe('guest')
  })

  describe('restoreSession', () => {
    it('signs back in with a saved session the store still accepts', async () => {
      stored.token = TOKEN
      mockAuth.getProfile.mockResolvedValue(PROFILE)
      await actions().restoreSession()
      expect(useSession.getState()).toMatchObject({ status: 'member', profile: PROFILE })
    })

    it('forgets a session the store refused', async () => {
      stored.token = TOKEN
      mockAuth.getProfile.mockRejectedValue(new AppApiError('unauthorized', 'gone'))
      await actions().restoreSession()
      expect(useSession.getState().status).toBe('guest')
      expect(stored.token).toBeNull()
    })

    it('keeps the saved session for next time when offline', async () => {
      stored.token = TOKEN
      mockAuth.getProfile.mockRejectedValue(new AppApiError('unavailable', 'offline'))
      await actions().restoreSession()
      expect(useSession.getState().status).toBe('guest')
      expect(stored.token).toBe(TOKEN)
    })
  })
})
