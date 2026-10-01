import { planPassSync, type PassSyncState } from '@/lib/loyalty/wallet-pass/sync-plan'
import { classifyApnsResponse } from '@/lib/loyalty/wallet-pass/apple-push'

jest.mock('server-only', () => ({}))

function state(overrides: Partial<PassSyncState> = {}): PassSyncState {
  return {
    hash: 'new',
    contentHash: 'new',
    applePushedHash: 'new',
    googleSyncedHash: 'new',
    isAppleConfigured: true,
    isGoogleConfigured: true,
    appleDeviceCount: 1,
    ...overrides,
  }
}

describe('planPassSync', () => {
  test('an unchanged card tells nobody anything', () => {
    expect(planPassSync(state())).toEqual({ recordContent: false, pushApple: false, patchGoogle: false })
  })

  test('a changed card is recorded and pushed to both wallets', () => {
    expect(planPassSync(state({ contentHash: 'old', applePushedHash: 'old', googleSyncedHash: 'old' })))
      .toEqual({ recordContent: true, pushApple: true, patchGoogle: true })
  })

  test('a download that already refreshed the content still pushes the other devices', () => {
    expect(planPassSync(state({ contentHash: 'new', applePushedHash: 'old' })).pushApple).toBe(true)
  })

  test('no registered iPhone means no APNs call', () => {
    expect(planPassSync(state({ applePushedHash: 'old', appleDeviceCount: 0 })).pushApple).toBe(false)
  })

  test('a member who never asked for a Google pass costs no Google call', () => {
    expect(planPassSync(state({ contentHash: 'old', googleSyncedHash: null })).patchGoogle).toBe(false)
  })

  test('an unconfigured wallet is never called', () => {
    const plan = planPassSync(state({
      applePushedHash: 'old', googleSyncedHash: 'old', isAppleConfigured: false, isGoogleConfigured: false,
    }))
    expect(plan.pushApple).toBe(false)
    expect(plan.patchGoogle).toBe(false)
  })
})

describe('classifyApnsResponse', () => {
  test('200 is sent', () => expect(classifyApnsResponse(200, '')).toBe('sent'))
  test('410 means the pass left the device', () => expect(classifyApnsResponse(410, '')).toBe('gone'))
  test('a bad token is gone too', () => {
    expect(classifyApnsResponse(400, JSON.stringify({ reason: 'BadDeviceToken' }))).toBe('gone')
  })
  test('anything else is a failure, not a prune', () => {
    expect(classifyApnsResponse(500, 'oops')).toBe('failed')
    expect(classifyApnsResponse(403, JSON.stringify({ reason: 'InvalidProviderToken' }))).toBe('failed')
  })
})
