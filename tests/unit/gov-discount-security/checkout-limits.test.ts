/**
 * The public Senior/PWD checkout calls are rate-limited per client IP (shared
 * across instances): the setup read, the preview, and an order that carries
 * a claim. Ordinary orders are untouched.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockLimit = jest.fn()
const mockAdmin = jest.fn()

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => mockLimit(...args),
}))
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 1000,
  createAdminClient: () => mockAdmin(),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const claim = { kind: 'senior', name: 'Juan Dela Cruz', idNumber: '12345' }

beforeEach(() => {
  jest.clearAllMocks()
  mockLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 })
  mockAdmin.mockImplementation(() => {
    throw new Error('must not read the database once limited')
  })
})

describe('gov claim limits', () => {
  it('refuses a claim on an order once the IP is over its limit, and ignores orders without one', async () => {
    const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')
    const onlineClaimsOn = jest.fn(async () => true)
    expect(await govClaimLimitRefusal(TENANT, claim, onlineClaimsOn)).toMatch(/Too many/)
    expect(await govClaimLimitRefusal(TENANT, null, onlineClaimsOn)).toBeNull()
    expect(await govClaimLimitRefusal(TENANT, undefined, onlineClaimsOn)).toBeNull()
    expect(mockLimit).toHaveBeenCalledTimes(1)
    expect(mockLimit.mock.calls[0][0]).toBe(`gov-claim-order:${TENANT}`)
  })

  it('does not count a malformed claim (the order ignores it) nor read the store for it', async () => {
    // Arrange
    const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')
    const onlineClaimsOn = jest.fn(async () => true)

    // Act
    const outcomes = await Promise.all([
      govClaimLimitRefusal(TENANT, {}, onlineClaimsOn),
      govClaimLimitRefusal(TENANT, 'senior', onlineClaimsOn),
      govClaimLimitRefusal(TENANT, { kind: 'senior', name: 'J', idNumber: '1' }, onlineClaimsOn),
    ])

    // Assert
    expect(outcomes).toEqual([null, null, null])
    expect(mockLimit).not.toHaveBeenCalled()
    expect(onlineClaimsOn).not.toHaveBeenCalled()
  })

  it('does not count a claim at a store with online claims off (the order ignores it)', async () => {
    const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')

    expect(await govClaimLimitRefusal(TENANT, claim, async () => false)).toBeNull()
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it('fails open when the store setting cannot be read', async () => {
    const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')

    const outcome = await govClaimLimitRefusal(TENANT, claim, async () => {
      throw new Error('timeout')
    })

    expect(outcome).toBeNull()
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it('stops the preview before any database read', async () => {
    const { previewCheckoutGovAction } = await import('@/app/actions/gov-discount-checkout')
    const outcome = await previewCheckoutGovAction({
      tenantId: TENANT,
      claim,
      lines: [{ menuItemId: 'm1', quantity: 1, subtotal: 560 }],
    })
    expect(outcome).toMatchObject({ status: 'refused' })
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('answers the setup read with "not offered" while limited', async () => {
    const { getCheckoutGovSetupAction } = await import('@/app/actions/gov-discount-checkout')
    expect(await getCheckoutGovSetupAction(TENANT)).toBeNull()
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('createOrderAction checks the claim limit only after the store is known', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/actions/orders.ts'), 'utf8')
    const check = source.search(/govClaimLimitRefusal\(tenantId, governmentClaim,/)
    const context = source.indexOf('await loadOrderTenantContext(')
    expect(check).toBeGreaterThan(-1)
    expect(context).toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(context)
  })
})
