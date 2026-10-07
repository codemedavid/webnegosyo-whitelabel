import { decideLaunch } from '@/lib/onboarding/launch'

describe('decideLaunch — owner request AND confirmed payment', () => {
  test('opens when the owner asked and the payment is confirmed', () => {
    expect(decideLaunch({ isLaunchRequested: true, leadStatus: 'paid' })).toBe(true)
  })

  test('an already-live lead also counts as paid', () => {
    expect(decideLaunch({ isLaunchRequested: true, leadStatus: 'live' })).toBe(true)
  })

  test('waits for the payment while the lead is unconfirmed', () => {
    expect(decideLaunch({ isLaunchRequested: true, leadStatus: 'initiated' })).toBe(false)
    expect(decideLaunch({ isLaunchRequested: true, leadStatus: 'setup_in_progress' })).toBe(false)
    expect(decideLaunch({ isLaunchRequested: true, leadStatus: null })).toBe(false)
  })

  test('a confirmed payment alone never opens an unreviewed store', () => {
    expect(decideLaunch({ isLaunchRequested: false, leadStatus: 'paid' })).toBe(false)
  })
})
