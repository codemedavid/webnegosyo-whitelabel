/**
 * validateVoucherAction is anonymous and reads vouchers with the service role,
 * so it is a code-guessing oracle. It must be rate limited per client and must
 * bound how much work one call can ask for.
 */

jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({})),
}))
jest.mock('@/lib/vouchers/preview', () => ({
  buildVoucherPreview: jest.fn(),
}))
jest.mock('@/lib/vouchers/repository', () => ({
  createVoucherLookup: jest.fn(() => ({})),
}))
jest.mock('@/lib/vouchers/order-voucher-flow', () => ({
  loadCategoryMap: jest.fn(async () => ({})),
}))

const LINE = { id: 'l1', menuItemId: 'm1', categoryId: 'c1', quantity: 1, subtotal: 100 }
const EMPTY_PREVIEW = { accepted: [], rejected: [], discountTotal: 0, deliveryDiscount: 0 }

async function load() {
  const rate = await import('@/lib/action-rate-limit')
  const preview = await import('@/lib/vouchers/preview')
  const { validateVoucherAction } = await import('@/app/actions/vouchers')
  return {
    checkActionRateLimit: jest.mocked(rate.checkActionRateLimit),
    buildVoucherPreview: jest.mocked(preview.buildVoucherPreview),
    validateVoucherAction,
  }
}

describe('validateVoucherAction abuse limits', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('refuses without touching the database when the client is over its rate limit', async () => {
    const { checkActionRateLimit, buildVoucherPreview, validateVoucherAction } = await load()
    checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 })

    const result = await validateVoucherAction({ tenantId: 't1', codes: ['SAVE10'], lines: [LINE] })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/too many/i)
    expect(buildVoucherPreview).not.toHaveBeenCalled()
  })

  it('rate limits on a voucher-specific scope', async () => {
    const { checkActionRateLimit, buildVoucherPreview, validateVoucherAction } = await load()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
    buildVoucherPreview.mockResolvedValue(EMPTY_PREVIEW as never)

    await validateVoucherAction({ tenantId: 't1', codes: ['SAVE10'], lines: [LINE] })

    expect(checkActionRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('voucher'),
      expect.objectContaining({ limit: expect.any(Number), windowSec: expect.any(Number) }),
    )
  })

  it('refuses more than five codes in one call', async () => {
    const { checkActionRateLimit, buildVoucherPreview, validateVoucherAction } = await load()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })

    const codes = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']
    const result = await validateVoucherAction({ tenantId: 't1', codes, lines: [LINE] })

    expect(result.success).toBe(false)
    expect(buildVoucherPreview).not.toHaveBeenCalled()
  })

  it('refuses an absurdly long code', async () => {
    const { checkActionRateLimit, buildVoucherPreview, validateVoucherAction } = await load()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })

    const result = await validateVoucherAction({ tenantId: 't1', codes: ['X'.repeat(500)], lines: [LINE] })

    expect(result.success).toBe(false)
    expect(buildVoucherPreview).not.toHaveBeenCalled()
  })

  it('still previews an ordinary request', async () => {
    const { checkActionRateLimit, buildVoucherPreview, validateVoucherAction } = await load()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
    buildVoucherPreview.mockResolvedValue(EMPTY_PREVIEW as never)

    const result = await validateVoucherAction({ tenantId: 't1', codes: ['SAVE10', 'FREESHIP'], lines: [LINE] })

    expect(result).toEqual({ success: true, data: EMPTY_PREVIEW })
    expect(buildVoucherPreview.mock.calls[0][0].codes).toEqual(['SAVE10', 'FREESHIP'])
  })
})
