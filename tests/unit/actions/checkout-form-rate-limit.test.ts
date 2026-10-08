/**
 * The public funnel form is anonymous, and every monthly lead mints a set-up
 * link that creates a store, an owner login and an AI menu read. Without a
 * per-IP limit a script could mint unbounded tenants and AI spend.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const checkActionRateLimit = jest.fn(async (...args: unknown[]) => { void args; return { allowed: true, retryAfterSec: 0 } })
const createCheckoutLead = jest.fn(async (...args: unknown[]) => { void args; return { data: { id: 'lead-1' }, error: null } })
const startStoreOnboarding = jest.fn(async (...args: unknown[]) => { void args; return 'token-1' })

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => checkActionRateLimit(...args),
}))
jest.mock('@/lib/checkout-leads/checkout-leads-service', () => ({
  createCheckoutLead: (...args: unknown[]) => createCheckoutLead(...args),
}))
jest.mock('@/lib/checkout-leads/platform-payment-methods-service', () => ({}))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: async () => {} }))
jest.mock('@/lib/posthog', () => ({ captureCheckoutLeadCreated: async () => {} }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/onboarding/start', () => ({
  startStoreOnboarding: (...args: unknown[]) => startStoreOnboarding(...args),
  issueOnboardingLink: async () => 'unused',
}))
jest.mock('@/lib/onboarding/staff', () => ({}))
jest.mock('@/lib/onboarding/repository', () => ({}))

const input = {
  name: 'Ana',
  email: 'ana@example.com',
  phone: '09171234567',
  business_name: 'Ana Cafe',
  selected_payment_method_id: 'pm-1',
  payment_term: 'monthly_subscription',
}

async function submit() {
  const { submitCheckoutForm } = await import('@/app/actions/checkout-leads')
  return (submitCheckoutForm as unknown as (value: unknown) => Promise<{ data: unknown; error: string | null; setupToken: string | null }>)(input)
}

describe('submitCheckoutForm rate limit', () => {
  beforeEach(() => {
    checkActionRateLimit.mockClear()
    createCheckoutLead.mockClear()
    startStoreOnboarding.mockClear()
  })

  test('refuses a throttled client before a lead or set-up link is created', async () => {
    // Arrange
    checkActionRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 600 })

    // Act
    const result = await submit()

    // Assert
    expect(result.error).toMatch(/too many/i)
    expect(result).not.toHaveProperty("setupToken")
    expect(createCheckoutLead).not.toHaveBeenCalled()
    expect(startStoreOnboarding).not.toHaveBeenCalled()
  })

  test('an allowed monthly lead is saved but gets no set-up link until it is paid', async () => {
    // Act
    const result = await submit()

    // Assert
    expect(checkActionRateLimit).toHaveBeenCalledWith('checkout-lead', expect.objectContaining({ limit: expect.any(Number) }))
    expect(createCheckoutLead).toHaveBeenCalled()
    expect(result).not.toHaveProperty("setupToken")
    expect(startStoreOnboarding).not.toHaveBeenCalled()
  })
})
