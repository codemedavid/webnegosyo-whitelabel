import { forgetWalletSession, readStoredWalletSession, storeWalletSession } from '@/lib/loyalty/wallet-session-storage'

const TENANT = '11111111-1111-1111-1111-111111111111'
const NOW = Date.parse('2026-10-04T00:00:00Z')
const session = { phone: '09171234567', token: 'ws1.abc', expiresAt: '2026-10-04T00:30:00Z' }

beforeEach(() => window.sessionStorage.clear())

test('round-trips a live session for its own store only', () => {
  storeWalletSession(TENANT, session)
  expect(readStoredWalletSession(TENANT, NOW)).toEqual(session)
  expect(readStoredWalletSession('22222222-2222-2222-2222-222222222222', NOW)).toBeNull()
})

test('an expired session is dropped, not reused', () => {
  storeWalletSession(TENANT, session)
  expect(readStoredWalletSession(TENANT, Date.parse(session.expiresAt))).toBeNull()
  expect(window.sessionStorage.length).toBe(0)
})

test('tampered or foreign-shaped values read as no session', () => {
  for (const raw of ['not json', '{"phone":1}', JSON.stringify({ ...session, token: 'x'.repeat(500) })]) {
    window.sessionStorage.setItem(`loyalty-wallet-session:${TENANT}`, raw)
    expect(readStoredWalletSession(TENANT, NOW)).toBeNull()
  }
})

test('forgetting clears it', () => {
  storeWalletSession(TENANT, session)
  forgetWalletSession(TENANT)
  expect(readStoredWalletSession(TENANT, NOW)).toBeNull()
})

test('blocked storage never throws', () => {
  const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => storeWalletSession(TENANT, session)).not.toThrow()
  expect(readStoredWalletSession(TENANT, NOW)).toBeNull()
  spy.mockRestore()
  set.mockRestore()
})
