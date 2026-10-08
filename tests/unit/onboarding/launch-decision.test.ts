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

describe('decideBuyerLaunch — "Go live" from the set-up page', () => {
  const { decideBuyerLaunch } = jest.requireActual('@/lib/onboarding/launch') as typeof import('@/lib/onboarding/launch')
  const ready = { hasStore: true, isBuilding: false, isLive: false, leadStatus: 'paid', blockers: [] as string[] }

  test('a paid, built store with nothing blocking may go live', () => {
    expect(decideBuyerLaunch(ready)).toEqual({ ok: true })
  })

  test('an already-live store is a no-op success', () => {
    expect(decideBuyerLaunch({ ...ready, isLive: true })).toEqual({ ok: true, isAlreadyLive: true })
  })

  test('refuses before the store exists or while it is still building', () => {
    expect(decideBuyerLaunch({ ...ready, hasStore: false })).toMatchObject({ ok: false, reason: 'no_store' })
    expect(decideBuyerLaunch({ ...ready, isBuilding: true })).toMatchObject({ ok: false, reason: 'building' })
  })

  test('refuses an unpaid lead even with a valid link', () => {
    expect(decideBuyerLaunch({ ...ready, leadStatus: 'initiated' })).toMatchObject({ ok: false, reason: 'not_paid' })
  })

  test('names what still blocks the launch', () => {
    // Act
    const result = decideBuyerLaunch({ ...ready, blockers: ['Add your menu', 'Ways to pay'] })

    // Assert
    expect(result).toEqual({ ok: false, reason: 'blocked', message: 'Finish these first: Add your menu, Ways to pay.' })
  })
})
