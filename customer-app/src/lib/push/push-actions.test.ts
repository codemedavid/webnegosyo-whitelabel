const mockPush = { register: jest.fn(), remove: jest.fn() }
jest.mock('./push-source', () => ({ createLivePush: () => mockPush, createPrototypePush: () => mockPush }))

const mockNative = {
  permission: 'undetermined' as 'undetermined' | 'granted' | 'denied',
  answer: 'granted' as 'undetermined' | 'granted' | 'denied',
  token: { token: 'ExponentPushToken[device-0001]', platform: 'ios', appVersion: '1.0.0' } as unknown,
}
jest.mock('./notifications', () => ({
  pushProjectId: () => 'project-1',
  readPermission: async () => mockNative.permission,
  askPermission: async () => {
    mockNative.permission = mockNative.answer
    return mockNative.answer
  },
  readPushToken: async () => mockNative.token,
}))

const mockPrefs = { choice: 'unset' as string, isAskDismissed: false }
jest.mock('./push-prefs', () => ({
  loadPushPrefs: async () => ({ choice: mockPrefs.choice, isAskDismissed: mockPrefs.isAskDismissed }),
  savePushChoice: async (choice: string) => {
    mockPrefs.choice = choice
  },
  saveAskDismissed: async () => {
    mockPrefs.isAskDismissed = true
  },
}))

const SESSION = `cs1.${'a'.repeat(43)}`
let isGuest = false

/** A fresh module graph (resetModules), so the session store is the one push-actions sees. */
function load(): typeof import('./push-actions') {
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the mocks are initialised
  const { useSession } = require('@/lib/stores/session') as typeof import('@/lib/stores/session')
  if (isGuest) useSession.getState().setGuest()
  else useSession.getState().setMember(SESSION, { name: 'Ana', phoneE164: '+639171234567' })
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the mocks are initialised
  return require('./push-actions')
}

beforeEach(() => {
  jest.clearAllMocks()
  isGuest = false
  mockNative.permission = 'undetermined'
  mockNative.answer = 'granted'
  mockPrefs.choice = 'unset'
  mockPrefs.isAskDismissed = false
})

describe('push actions', () => {
  it('Turn on asks the phone, remembers the choice and files the token under the session', async () => {
    const actions = load()
    await expect(actions.turnOnNotifications()).resolves.toBe('granted')
    expect(mockPush.register).toHaveBeenCalledWith(SESSION, mockNative.token)
    expect(mockPrefs.choice).toBe('on')
    expect(actions.usePush.getState()).toMatchObject({ permission: 'granted', choice: 'on' })
  })

  it('a refusal registers nothing and keeps the choice unset', async () => {
    mockNative.answer = 'denied'
    const actions = load()
    await expect(actions.turnOnNotifications()).resolves.toBe('denied')
    expect(mockPush.register).not.toHaveBeenCalled()
    expect(actions.usePush.getState()).toMatchObject({ permission: 'denied', choice: 'unset' })
  })

  it('sync never asks the phone: it registers only an install that is already allowed', async () => {
    const actions = load()
    await actions.syncPushRegistration()
    expect(mockPush.register).not.toHaveBeenCalled()
    mockNative.permission = 'granted'
    const fresh = load()
    await fresh.syncPushRegistration()
    expect(mockPush.register).toHaveBeenCalledTimes(1)
  })

  it('sync respects Off on this phone, guests, and a build without a token', async () => {
    mockNative.permission = 'granted'
    mockPrefs.choice = 'off'
    await load().syncPushRegistration()
    mockPrefs.choice = 'unset'
    isGuest = true
    await load().syncPushRegistration()
    isGuest = false
    mockNative.token = null
    await load().syncPushRegistration()
    expect(mockPush.register).not.toHaveBeenCalled()
    mockNative.token = { token: 'ExponentPushToken[device-0001]', platform: 'ios', appVersion: '1.0.0' }
  })

  it('sync swallows a failed registration (offline must never break sign-in)', async () => {
    mockNative.permission = 'granted'
    mockPush.register.mockRejectedValueOnce(new Error('offline'))
    await expect(load().syncPushRegistration()).resolves.toBeUndefined()
  })

  it('Off removes this session’s tokens and is remembered', async () => {
    const actions = load()
    await actions.turnOffNotifications()
    expect(mockPush.remove).toHaveBeenCalledWith(SESSION)
    expect(mockPrefs.choice).toBe('off')
    expect(actions.usePush.getState().choice).toBe('off')
  })

  it('Not now hides the card for good', async () => {
    const actions = load()
    await actions.dismissNotificationAsk()
    expect(mockPrefs.isAskDismissed).toBe(true)
    expect(actions.usePush.getState().isAskDismissed).toBe(true)
  })
})
