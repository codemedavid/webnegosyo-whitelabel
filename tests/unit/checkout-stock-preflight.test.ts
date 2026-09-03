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

import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { findCheckoutStockShortfallMessage } from '@/lib/inventory/checkout-stock-guard'

const guard = findCheckoutStockShortfallMessage as jest.MockedFunction<
  typeof findCheckoutStockShortfallMessage
>

const LINES = [{ menuItemId: 'item-1', quantity: 3 }]

describe('checkout stock preflight', () => {
  beforeEach(() => jest.resetAllMocks())

  it('refuses with the guard’s own sentence when the kitchen cannot make the cart', async () => {
    // Arrange
    guard.mockResolvedValue('Sorry — Cheesy Scallops has only 2 left. Please adjust your cart and try again.')

    // Act
    const verdict = await preflightCheckoutStockAction('tenant-1', LINES, null)

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
    expect(await preflightCheckoutStockAction('tenant-1', LINES, null)).toEqual({ ok: true })
  })

  it('judges the cart against the branch taking the order', async () => {
    // Arrange
    guard.mockResolvedValue('')

    // Act
    await preflightCheckoutStockAction('tenant-1', LINES, 'outlet-9')

    // Assert
    expect(guard).toHaveBeenCalledWith('tenant-1', LINES, 'outlet-9')
  })

  it('lets the order through when the read itself fails', async () => {
    // Arrange: silence is inventory's default. A wrongly refused order costs a
    // real sale; the authoritative guard still runs inside createOrderAction.
    guard.mockRejectedValue(new Error('network'))

    // Act & Assert
    expect(await preflightCheckoutStockAction('tenant-1', LINES, null)).toEqual({ ok: true })
  })
})
