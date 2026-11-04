/**
 * The checkout's inventory look before it says "Order placed".
 *
 * The web checkout is optimistic: the confirmation screen renders before the
 * order row is written, and the background save only console.warns when the
 * server refuses. The presell guard is already hoisted ahead of that screen for
 * exactly this reason. The producible-quantity guard was not — so a cart the
 * kitchen cannot make showed the customer "Order Placed!" while no order was
 * ever created and the merchant never heard about it.
 *
 * This wrapper runs the same guard early. It refuses only when the guard has an
 * opinion; inventory's default is silence, so anything that goes wrong here
 * must let the order through and leave the authoritative check in
 * `createOrderAction` to have the last word.
 */

jest.mock('@/lib/inventory/checkout-stock-guard', () => ({
  findCheckoutStockShortfallMessage: jest.fn(),
}))

const checkActionRateLimit = jest.fn()
jest.mock('@/lib/action-rate-limit', () => ({
  checkActionRateLimit: (...args: unknown[]) => checkActionRateLimit(...args),
}))

import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { findCheckoutStockShortfallMessage } from '@/lib/inventory/checkout-stock-guard'

const guard = findCheckoutStockShortfallMessage as jest.MockedFunction<
  typeof findCheckoutStockShortfallMessage
>

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const BRANCH = '66ea076d-2aa1-45d4-b575-743fcdf3d73a'
const ITEM = '7a1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
const LINES = [{ menuItemId: ITEM, quantity: 3 }]

describe('checkout stock preflight', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
  })

  it('refuses with the guard’s own sentence when the kitchen cannot make the cart', async () => {
    // Arrange
    guard.mockResolvedValue('Sorry — Cheesy Scallops has only 2 left. Please adjust your cart and try again.')

    // Act
    const verdict = await preflightCheckoutStockAction(TENANT, LINES, null)

    // Assert
    expect(verdict).toEqual({
      ok: false,
      message: 'Sorry — Cheesy Scallops has only 2 left. Please adjust your cart and try again.',
    })
  })

  it('lets the order through when the guard has no opinion', async () => {
    // Arrange
    guard.mockResolvedValue('')

    // Act & Assert
    expect(await preflightCheckoutStockAction(TENANT, LINES, null)).toEqual({ ok: true })
  })

  it('judges the cart against the branch taking the order', async () => {
    // Arrange
    guard.mockResolvedValue('')

    // Act
    await preflightCheckoutStockAction(TENANT, LINES, BRANCH)

    // Assert
    expect(guard).toHaveBeenCalledWith(TENANT, LINES, BRANCH)
  })

  it('lets the order through when the read itself fails', async () => {
    // Arrange: silence is inventory's default. A wrongly refused order costs a
    // real sale; the authoritative guard still runs inside createOrderAction.
    guard.mockRejectedValue(new Error('network'))

    // Act & Assert
    expect(await preflightCheckoutStockAction(TENANT, LINES, null)).toEqual({ ok: true })
  })

  describe('an open action does not take arbitrary input', () => {
    const bad: Array<[string, unknown, unknown]> = [
      ['a tenant that is not an id', 'tenant-1', LINES],
      ['a dish that is not an id', TENANT, [{ menuItemId: 'item-1', quantity: 1 }]],
      ['a fractional quantity', TENANT, [{ menuItemId: ITEM, quantity: 1.5 }]],
      ['a quantity of zero', TENANT, [{ menuItemId: ITEM, quantity: 0 }]],
      ['a quantity over 99', TENANT, [{ menuItemId: ITEM, quantity: 100 }]],
      ['more than 50 lines', TENANT, Array.from({ length: 51 }, () => ({ menuItemId: ITEM, quantity: 1 }))],
      ['a huge option list', TENANT, [{ menuItemId: ITEM, quantity: 1, optionIds: Array.from({ length: 200 }, (_, i) => `o${i}`) }]],
      ['add-on portions out of range', TENANT, [{ menuItemId: ITEM, quantity: 1, addonQuantities: { a1: 1000 } }]],
      ['no lines at all', TENANT, 'not-an-array'],
    ]

    it.each(bad)('has no opinion on %s — and reads nothing', async (_label, tenantId, lines) => {
      // Act
      const verdict = await preflightCheckoutStockAction(tenantId as string, lines as never, null)

      // Assert
      expect(verdict).toEqual({ ok: true })
      expect(guard).not.toHaveBeenCalled()
    })

    it('has no opinion on a branch that is not an id', async () => {
      expect(await preflightCheckoutStockAction(TENANT, LINES, 'branch-1')).toEqual({ ok: true })
      expect(guard).not.toHaveBeenCalled()
    })

    it('accepts a configured line the checkout really sends', async () => {
      guard.mockResolvedValue('')
      const line = { menuItemId: ITEM, quantity: 2, optionIds: ['o-large'], addonIds: ['a-pearls'],
        modifierOptionIds: ['o-large', 'a-pearls'], addonQuantities: { 'a-pearls': 2 } }

      await preflightCheckoutStockAction(TENANT, [line], null)

      expect(guard).toHaveBeenCalledWith(TENANT, [line], null)
    })
  })

  describe('rate limit', () => {
    it('counts calls per client per store, holding across instances', async () => {
      guard.mockResolvedValue('')

      await preflightCheckoutStockAction(TENANT, LINES, null)

      const [scope, options] = checkActionRateLimit.mock.calls[0] as [string, { onRedisFailure?: string; limit: number }]
      expect(scope).toContain(TENANT)
      expect(options.onRedisFailure).toBe('instance')
    })

    it('past the allowance it has no opinion and reads nothing', async () => {
      checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 })

      expect(await preflightCheckoutStockAction(TENANT, LINES, null)).toEqual({ ok: true })
      expect(guard).not.toHaveBeenCalled()
    })
  })
})
