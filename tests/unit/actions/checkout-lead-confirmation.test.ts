/**
 * The confirmation page is public: anyone holding (or guessing) a reference
 * number reaches it. So the lookup and the proof upload are rate limited per
 * IP (falling back to a per-instance limit if Redis is down), the lookup hands
 * the page only what it shows, and a proof can be attached only while the lead
 * is still awaiting payment and only as an ImageKit URL.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

type Limit = { allowed: boolean; retryAfterSec: number }
const checkActionRateLimit = jest.fn(async (...args: unknown[]): Promise<Limit> => { void args; return { allowed: true, retryAfterSec: 0 } })

interface Call { method: string; args: unknown[] }
let calls: Call[] = []
let result: { data: unknown; error: { message: string } | null } = { data: null, error: null }

function builder() {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'update', 'limit']) {
    chain[method] = (...args: unknown[]) => { calls.push({ method, args }); return chain }
  }
  chain.maybeSingle = async () => { calls.push({ method: 'maybeSingle', args: [] }); return result }
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result)
  return chain
}

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => checkActionRateLimit(...args),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...args: unknown[]) => { calls.push({ method: 'from', args }); return builder() } }),
}))
jest.mock('@/lib/meta-conversions', () => ({ sendMetaConversionEvent: async () => {} }))
jest.mock('@/lib/platform-staff/guard', () => ({ requirePlatformPermission: async () => {} }))
jest.mock('@/lib/posthog', () => ({ captureCheckoutLeadCreated: async () => {} }))
jest.mock('@/lib/onboarding/start', () => ({ issueOnboardingLink: async () => 'unused' }))
jest.mock('@/lib/onboarding/staff', () => ({}))
jest.mock('@/lib/onboarding/repository', () => ({}))
jest.mock('@/lib/imagekit-utils', () => ({ getImageKitEndpoint: () => 'https://ik.imagekit.io/webnegosyo' }))

const REF = 'WN-20261026-ABCD2345'
const PROOF = 'https://ik.imagekit.io/webnegosyo/checkout-proofs/proof-1.png'

async function actions() {
  return import('@/app/actions/checkout-leads')
}

beforeEach(() => {
  calls = []
  result = { data: null, error: null }
  checkActionRateLimit.mockClear()
})

describe('fetchCheckoutLeadByRef', () => {
  test('is rate limited per IP with the per-instance fallback', async () => {
    // Arrange
    checkActionRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 })
    const { fetchCheckoutLeadByRef } = await actions()

    // Act
    const lookup = await fetchCheckoutLeadByRef(REF)

    // Assert
    expect(lookup.data).toBeNull()
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      'checkout-lead-lookup',
      expect.objectContaining({ onRedisFailure: 'instance' })
    )
    expect(calls).toHaveLength(0)
  })

  test('a malformed reference never reaches the database', async () => {
    const { fetchCheckoutLeadByRef } = await actions()

    const lookup = await fetchCheckoutLeadByRef("WN-%' or 1=1")

    expect(lookup.data).toBeNull()
    expect(calls).toHaveLength(0)
  })

  test('selects only what the page shows and returns nothing else', async () => {
    // Arrange: a database that over-answers must not leak the extra columns
    result = {
      data: {
        reference_number: REF,
        amount: 999,
        payment_term: 'monthly_subscription',
        payment_proof_url: null,
        email: 'buyer@example.com',
        phone: '09171234567',
        platform_payment_methods: { name: 'GCash', details: '0917', qr_code_url: null, id: 'pm-1' },
      },
      error: null,
    }
    const { fetchCheckoutLeadByRef } = await actions()

    // Act
    const lookup = await fetchCheckoutLeadByRef(REF)

    // Assert
    const select = calls.find((call) => call.method === 'select')
    expect(String(select?.args[0])).not.toContain('*')
    expect(String(select?.args[0])).not.toMatch(/email|phone|business_name|notes|status/)
    expect(lookup.data).toEqual({
      reference_number: REF,
      amount: 999,
      payment_term: 'monthly_subscription',
      payment_proof_url: null,
      platform_payment_methods: { name: 'GCash', details: '0917', qr_code_url: null },
    })
  })

  test('a legacy 4-character reference still resolves', async () => {
    result = {
      data: { reference_number: 'WN-20260410-ABCD', amount: 3899, payment_term: 'full_payment', payment_proof_url: null, platform_payment_methods: null },
      error: null,
    }
    const { fetchCheckoutLeadByRef } = await actions()

    const lookup = await fetchCheckoutLeadByRef('WN-20260410-ABCD')

    expect(lookup.data?.reference_number).toBe('WN-20260410-ABCD')
  })
})

describe('submitPaymentProof', () => {
  test('is rate limited per IP with the per-instance fallback', async () => {
    checkActionRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 })
    const { submitPaymentProof } = await actions()

    const outcome = await submitPaymentProof(REF, PROOF)

    expect(outcome.error).toMatch(/too many/i)
    expect(checkActionRateLimit).toHaveBeenCalledWith(
      'checkout-lead-proof',
      expect.objectContaining({ onRedisFailure: 'instance' })
    )
    expect(calls).toHaveLength(0)
  })

  test.each([
    ['https://evil.example.com/proof.png'],
    ['http://ik.imagekit.io/webnegosyo/proof.png'],
    ['javascript:alert(1)'],
  ])('refuses a proof that is not an ImageKit https URL: %s', async (url) => {
    const { submitPaymentProof } = await actions()

    const outcome = await submitPaymentProof(REF, url)

    expect(outcome.error).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  test('only updates a lead that is still awaiting payment', async () => {
    // Arrange
    result = { data: [{ id: 'lead-1' }], error: null }
    const { submitPaymentProof } = await actions()

    // Act
    const outcome = await submitPaymentProof(REF, PROOF)

    // Assert
    expect(outcome.error).toBeNull()
    const filters = calls.filter((call) => call.method === 'eq').map((call) => call.args)
    expect(filters).toEqual(expect.arrayContaining([['reference_number', REF], ['status', 'initiated']]))
    expect(calls.some((call) => call.method === 'select')).toBe(true)
  })

  test('reports a refusal when no lead was updated', async () => {
    // Arrange: paid / cancelled / unknown reference → zero rows
    result = { data: [], error: null }
    const { submitPaymentProof } = await actions()

    // Act
    const outcome = await submitPaymentProof(REF, PROOF)

    // Assert
    expect(outcome.error).toBeTruthy()
  })
})
