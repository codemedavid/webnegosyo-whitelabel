/** @jest-environment node */

const cookieSet = jest.fn()
const redeemInvite = jest.fn()
const checkActionRateLimit = jest.fn()

jest.mock('next/headers', () => ({ cookies: async () => ({ set: (...a: unknown[]) => cookieSet(...a) }) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/action-rate-limit', () => ({ checkActionRateLimit: (...a: unknown[]) => checkActionRateLimit(...a) }))
jest.mock('@/lib/checkout-leads/checkout-leads-service', () => ({ createPaidCheckoutLead: jest.fn() }))
jest.mock('@/lib/onboarding/start', () => ({ startStoreOnboarding: jest.fn() }))
jest.mock('@/lib/onboarding/invites/repository', () => ({
  attachInviteLead: jest.fn(), claimInvite: jest.fn(), isEmailTaken: jest.fn(), releaseInvite: jest.fn(),
}))
jest.mock('@/lib/onboarding/invites/redeem', () => ({ redeemInvite: (...a: unknown[]) => redeemInvite(...a) }))

const CODE = 'a'.repeat(22)
const FORM = { name: 'Juan dela Cruz', business_name: "Juan's Kitchen", email: 'juan@example.com', phone: '09171234567' }

// next/jest leaves static imports ahead of jest.mock — import the action lazily.
const loadAction = async () => (await import('@/app/actions/signup-link')).redeemSignupLinkAction

beforeEach(() => {
  jest.clearAllMocks()
  checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
})

describe('redeemSignupLinkAction', () => {
  test('a redeemed link sends the browser to its wizard and remembers it on the link path', async () => {
    // Arrange
    redeemInvite.mockResolvedValue({ kind: 'started', token: 'tok-1', leadId: 'lead-1' })
    const redeem = await loadAction()

    // Act
    const result = await redeem(CODE, FORM)

    // Assert
    expect(result).toEqual({ path: '/onboarding/tok-1', error: null })
    expect(cookieSet).toHaveBeenCalledWith('wn_join', 'tok-1', expect.objectContaining({ httpOnly: true, path: `/onboarding/join/${CODE}` }))
  })

  test('a malformed code is refused without touching the database or the rate limit', async () => {
    const redeem = await loadAction()

    const result = await redeem('../etc', FORM)

    expect(result.path).toBeNull()
    expect(redeemInvite).not.toHaveBeenCalled()
    expect(checkActionRateLimit).not.toHaveBeenCalled()
  })

  test('a form trying to set its own plan is refused', async () => {
    const redeem = await loadAction()

    const result = await redeem(CODE, { ...FORM, payment_term: 'full_payment' })

    expect(result.path).toBeNull()
    expect(redeemInvite).not.toHaveBeenCalled()
  })

  test('too many tries are refused before the link is touched', async () => {
    checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 300 })
    const redeem = await loadAction()

    const result = await redeem(CODE, FORM)

    expect(result.error).toMatch(/too many tries/i)
    expect(redeemInvite).not.toHaveBeenCalled()
  })

  test.each([
    ['email_taken', /already has a WebNegosyo login/],
    ['unavailable', /already used or is no longer valid/],
    ['failed', /could not save/],
  ])('a %s refusal sets no cookie and explains itself', async (kind, message) => {
    redeemInvite.mockResolvedValue({ kind })
    const redeem = await loadAction()

    const result = await redeem(CODE, FORM)

    expect(result.path).toBeNull()
    expect(result.error).toMatch(message)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  test('a thrown redeem reads as a retryable failure, never a crash', async () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    redeemInvite.mockRejectedValue(new Error('db down'))
    const redeem = await loadAction()

    const result = await redeem(CODE, FORM)

    expect(result.error).toMatch(/could not save/)
  })
})

export {}
