/**
 * The set-up link creates a store and an owner login, so it goes out only to
 * customers whose payment staff have confirmed.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const leadStatus = { value: 'paid' as string | null }
const issueOnboardingLink = jest.fn(async (...args: unknown[]) => { void args; return 'tok-1' })
const createPaidCheckoutLead = jest.fn(async (...args: unknown[]) => { void args; return { data: { id: 'lead-9' }, error: null as string | null } })

jest.mock('@/lib/action-rate-limit', () => ({ checkActionRateLimit: async () => ({ allowed: true }) }))
jest.mock('@/lib/checkout-leads/checkout-leads-service', () => ({
  createPaidCheckoutLead: (...args: unknown[]) => createPaidCheckoutLead(...args),
}))
jest.mock('@/lib/checkout-leads/platform-payment-methods-service', () => ({}))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: async () => {} }))
jest.mock('@/lib/posthog', () => ({ captureCheckoutLeadCreated: async () => {} }))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: leadStatus.value ? { status: leadStatus.value } : null, error: null }) }),
      }),
    }),
  }),
}))
jest.mock('@/lib/onboarding/start', () => ({ issueOnboardingLink: (...args: unknown[]) => issueOnboardingLink(...args) }))
jest.mock('@/lib/onboarding/staff', () => ({}))
jest.mock('@/lib/onboarding/repository', () => ({}))

beforeEach(() => {
  issueOnboardingLink.mockClear()
  createPaidCheckoutLead.mockClear()
  leadStatus.value = 'paid'
})

describe('issueLeadSetupLink', () => {
  test('issues a link for a paid lead', async () => {
    // Arrange
    const { issueLeadSetupLink } = await import('@/app/actions/checkout-leads')

    // Act
    const result = await issueLeadSetupLink('lead-1')

    // Assert
    expect(result).toEqual({ path: '/onboarding/tok-1', error: null })
    expect(issueOnboardingLink).toHaveBeenCalledWith('lead-1')
  })

  test('refuses an unpaid lead without minting a link', async () => {
    // Arrange
    const { issueLeadSetupLink } = await import('@/app/actions/checkout-leads')
    leadStatus.value = 'initiated'

    // Act
    const result = await issueLeadSetupLink('lead-1')

    // Assert
    expect(result.path).toBeNull()
    expect(result.error).toMatch(/Paid/)
    expect(issueOnboardingLink).not.toHaveBeenCalled()
  })
})

describe('invitePaidCustomer', () => {
  const valid = { name: 'Ana Reyes', email: 'ana@example.com', phone: '09171234567', business_name: 'Kape ni Ana', payment_term: 'monthly_subscription' }

  test('saves a paid lead and returns its set-up link', async () => {
    // Arrange
    const { invitePaidCustomer } = await import('@/app/actions/checkout-leads')

    // Act
    const result = await invitePaidCustomer(valid)

    // Assert
    expect(result).toEqual({ leadId: 'lead-9', path: '/onboarding/tok-1', error: null })
    expect(createPaidCheckoutLead).toHaveBeenCalledWith(expect.objectContaining({ business_name: 'Kape ni Ana' }))
  })

  test('refuses an invalid form before anything is saved', async () => {
    // Arrange
    const { invitePaidCustomer } = await import('@/app/actions/checkout-leads')

    // Act
    const result = await invitePaidCustomer({ ...valid, email: 'nope' })

    // Assert
    expect(result.error).toMatch(/valid email/)
    expect(createPaidCheckoutLead).not.toHaveBeenCalled()
  })
})
