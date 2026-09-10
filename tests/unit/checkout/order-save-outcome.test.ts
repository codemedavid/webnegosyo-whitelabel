/**
 * Telling a refusal apart from a failure.
 *
 * The checkout says "Order Placed!" before the row exists, so everything the
 * customer learns afterwards comes from this classification. Two outcomes look
 * identical to the old code and could not be more different to act on:
 *
 *  - the store REFUSED the order (below the minimum, sold out, no delivery
 *    coordinates). Nothing is wrong with the platform. Sending the Messenger
 *    message hands the merchant an order the store already rejected.
 *  - the save FAILED (network, RLS, a thrown backend error). The order is
 *    genuinely lost, and the Messenger message is the merchant's only
 *    remaining copy of it.
 *
 * The old path collapsed both into "We could not confirm your order with the
 * store. Please send the Messenger message so they receive it." — which is
 * wrong advice for the first case and throws away a sentence the customer
 * could have acted on.
 */

import {
  classifyOrderSave,
  GENERIC_SAVE_FAILURE_MESSAGE,
  GENERIC_REFUSAL_MESSAGE,
} from '@/lib/checkout/order-save-outcome'

describe('classifyOrderSave — a saved order', () => {
  it('reports success and says nothing to the customer', () => {
    // Arrange
    const reply = { success: true }

    // Act
    const notice = classifyOrderSave(reply)

    // Assert
    expect(notice.verdict).toBe('saved')
    expect(notice.message).toBe('')
  })
})

describe('classifyOrderSave — the store refused the order', () => {
  it('shows the store\'s own sentence rather than a generic one', () => {
    // The whole point: "Sorry, Adobo just went out of stock. Please remove it
    // from your cart and try again." is actionable; "we could not confirm your
    // order" is not.
    const reply = {
      success: false,
      refused: true,
      error: 'Sorry, Adobo just went out of stock. Please remove it from your cart and try again.',
    }

    const notice = classifyOrderSave(reply)

    expect(notice.verdict).toBe('refused')
    expect(notice.message).toBe(reply.error)
  })

  it('does NOT offer Messenger as a recovery for a refused order', () => {
    // Sending the message would hand the merchant an order the platform
    // deliberately rejected — the exact harm being fixed.
    const reply = { success: false, refused: true, error: 'This order is below the minimum for checkout' }

    expect(classifyOrderSave(reply).isMessengerRecoverable).toBe(false)
  })

  it('falls back to a plain refusal sentence when the server named no reason', () => {
    const reply = { success: false, refused: true }

    const notice = classifyOrderSave(reply)

    expect(notice.verdict).toBe('refused')
    expect(notice.message).toBe(GENERIC_REFUSAL_MESSAGE)
  })

  it('ignores a blank reason the same way as a missing one', () => {
    const notice = classifyOrderSave({ success: false, refused: true, error: '   ' })

    expect(notice.message).toBe(GENERIC_REFUSAL_MESSAGE)
  })
})

describe('classifyOrderSave — the save failed', () => {
  it('keeps the generic wording and keeps Messenger as the recovery', () => {
    // A transport failure is the case the original copy was written for, and
    // it stays exactly as it was: the Messenger message is the merchant's only
    // remaining copy of this order.
    const reply = { success: false, error: 'Failed to create order' }

    const notice = classifyOrderSave(reply)

    expect(notice.verdict).toBe('failed')
    expect(notice.message).toBe(GENERIC_SAVE_FAILURE_MESSAGE)
    expect(notice.isMessengerRecoverable).toBe(true)
  })

  it('treats a missing reply as a failure, never as a refusal', () => {
    // Fails open towards "the order may be lost". Mistaking a lost order for a
    // refusal would withhold the Messenger message that still delivers it.
    for (const reply of [undefined, null, {}]) {
      expect(classifyOrderSave(reply).verdict).toBe('failed')
      expect(classifyOrderSave(reply).isMessengerRecoverable).toBe(true)
    }
  })

  it('does not leak a backend error string to the customer', () => {
    // Postgres/RLS text ("new row violates row-level security policy") means
    // nothing to a diner and reveals internals. Only a REFUSAL carries a
    // sentence written for a customer.
    const notice = classifyOrderSave({
      success: false,
      error: 'new row violates row-level security policy for table "orders"',
    })

    expect(notice.message).toBe(GENERIC_SAVE_FAILURE_MESSAGE)
    expect(notice.message).not.toMatch(/row-level security/i)
  })

  it('refuses to trust `refused` without an explicit true', () => {
    // A backend that has not been taught the discriminator yet must read as a
    // failure, not as a refusal — same fail-closed reasoning as
    // isOrderSaveRetrySafe.
    const notice = classifyOrderSave({ success: false, refused: undefined, error: 'boom' })

    expect(notice.verdict).toBe('failed')
  })
})
