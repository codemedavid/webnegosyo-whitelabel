import { buildLaunchReadiness, type LaunchSnapshot } from '@/lib/onboarding/readiness'

const READY: LaunchSnapshot = {
  menuItemCount: 24,
  paymentMethodCount: 2,
  enabledOrderTypeCount: 2,
  hasLogo: true,
  hasMessenger: true,
  hasHours: true,
  isLoyaltyLive: true,
  boostOfferCount: 5,
}

describe('buildLaunchReadiness', () => {
  test('a complete store can launch with a full score', () => {
    // Act
    const readiness = buildLaunchReadiness(READY)

    // Assert
    expect(readiness.canLaunch).toBe(true)
    expect(readiness.blockers).toEqual([])
    expect(readiness.score).toBe(100)
  })

  test('no menu, no payment or no order type blocks the launch', () => {
    // Act
    const readiness = buildLaunchReadiness({ ...READY, menuItemCount: 0, paymentMethodCount: 0, enabledOrderTypeCount: 0 })

    // Assert
    expect(readiness.canLaunch).toBe(false)
    expect(readiness.blockers.map((item) => item.id)).toEqual(['menu', 'payments', 'order_types'])
  })

  test('nice-to-haves lower the score but never block', () => {
    // Act
    const readiness = buildLaunchReadiness({ ...READY, hasMessenger: false, isLoyaltyLive: false, boostOfferCount: 0 })

    // Assert
    expect(readiness.canLaunch).toBe(true)
    expect(readiness.score).toBeLessThan(100)
    expect(readiness.items.find((item) => item.id === 'messenger')).toMatchObject({ isDone: false, isBlocker: false })
  })

  test('every item links somewhere in the admin', () => {
    const readiness = buildLaunchReadiness(READY)
    for (const item of readiness.items) expect(item.adminPath.startsWith('/')).toBe(true)
  })
})
