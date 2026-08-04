/**
 * Whether checkout should ask HOW the order is fulfilled.
 *
 * A dine-in-only restaurant has nothing to ask: the sole order type is already
 * selected for the customer the moment checkout loads, so the "How would you
 * like to receive your order?" section is a question with one answer already
 * filled in. It reads as a step, and on a branch-QR flow — where the branch is
 * answered by the link too — it is the last thing standing between the scan and
 * the form.
 *
 * The one case where a single order type still has a question in it is advance
 * ordering: that same section hosts the ASAP-or-schedule choice and the date
 * and time slots. Hiding it there would take away the only way to place a
 * pre-order, so the rule is about the QUESTION, not the count.
 */

import { shouldAskFulfillmentMethod } from '@/lib/checkout-fulfillment-choice'
import type { OrderType } from '@/types/database'

const orderType = (id: string, overrides: Partial<OrderType> = {}): OrderType =>
  ({
    id,
    name: id,
    type: 'dine_in',
    advance_order_enabled: false,
    ...overrides,
  }) as unknown as OrderType

describe('asking for a fulfillment method', () => {
  it('asks when the merchant offers more than one', () => {
    // Arrange
    const types = [orderType('dine-in'), orderType('pickup')]

    // Act & Assert
    expect(shouldAskFulfillmentMethod(types)).toBe(true)
  })

  it('does not ask when there is exactly one and nothing to schedule', () => {
    // Arrange: a dine-in-only restaurant.
    const types = [orderType('dine-in')]

    // Act & Assert
    expect(shouldAskFulfillmentMethod(types)).toBe(false)
  })

  it('still asks when the sole order type takes advance orders', () => {
    // Arrange: the section carries the ASAP-or-schedule choice.
    const types = [orderType('pickup', { advance_order_enabled: true })]

    // Act & Assert
    expect(shouldAskFulfillmentMethod(types)).toBe(true)
  })

  it('does not ask before the order types have loaded', () => {
    // Arrange: an empty list is "not yet", and an empty section is not a
    // question. The existing loading state covers this moment.

    // Act & Assert
    expect(shouldAskFulfillmentMethod([])).toBe(false)
  })
})
