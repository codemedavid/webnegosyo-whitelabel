/**
 * The order save that has to survive the Messenger redirect.
 *
 * The web checkout is optimistic: it renders "Order Placed!", clears the cart,
 * and three seconds later opens m.me in a new tab. The order row is written by
 * a fire-and-forget `createOrderAction(...)` whose failure path was a single
 * `console.warn`. Two consequences, both reported from production:
 *
 *  1. On a phone, the m.me deep link hands the browser to the Messenger app.
 *     The checkout tab is backgrounded and frozen, and any request still in
 *     flight is abandoned. The customer sees success, the merchant gets the
 *     Messenger message, and no order row is ever written.
 *  2. A transient refusal — a dropped connection, a cold serverless start —
 *     was never retried, even though `client_order_id` makes a retry safe.
 *
 * `saveOrderDurably` is the retry half of the fix. It is deliberately allowed
 * to retry EVERY failure: the server dedupes on `client_order_id`, so the
 * worst case for a deterministic refusal is a bounded wait, while the best
 * case for a transient one is the order the merchant would otherwise lose.
 */

import {
  saveOrderDurably,
  DEFAULT_SAVE_ATTEMPTS,
} from '@/lib/checkout/durable-order-save'

const noSleep = () => Promise.resolve()

describe('saveOrderDurably', () => {
  it('reports success without retrying when the first save works', async () => {
    // Arrange
    const save = jest.fn().mockResolvedValue({ success: true })

    // Act
    const result = await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(result).toEqual({ ok: true, attempts: 1 })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('retries a refused save and reports the attempt that succeeded', async () => {
    // The whole point: a transient refusal must not cost the merchant an order.
    // Arrange
    const save = jest
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'network' })
      .mockResolvedValueOnce({ success: true })

    // Act
    const result = await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(result).toEqual({ ok: true, attempts: 2 })
  })

  it('retries a save that throws, not only one that returns success:false', async () => {
    // An aborted fetch rejects; it does not resolve with a verdict.
    // Arrange
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ success: true })

    // Act
    const result = await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(result.ok).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('gives up after the attempt ceiling and reports the last error', async () => {
    // Arrange
    const save = jest.fn().mockResolvedValue({ success: false, error: 'Out of stock' })

    // Act
    const result = await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(result).toEqual({
      ok: false,
      attempts: DEFAULT_SAVE_ATTEMPTS,
      error: 'Out of stock',
    })
    expect(save).toHaveBeenCalledTimes(DEFAULT_SAVE_ATTEMPTS)
  })

  it('surfaces a thrown error’s message rather than swallowing it', async () => {
    // Arrange
    const save = jest.fn().mockRejectedValue(new Error('Failed to fetch'))

    // Act
    const result = await saveOrderDurably(save, { attempts: 2, sleep: noSleep })

    // Assert
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to fetch')
  })

  it('backs off between attempts instead of hammering the server', async () => {
    // Arrange
    const waited: number[] = []
    const sleep = (ms: number) => {
      waited.push(ms)
      return Promise.resolve()
    }
    const save = jest.fn().mockResolvedValue({ success: false, error: 'boom' })

    // Act
    await saveOrderDurably(save, { attempts: 3, sleep })

    // Assert — a wait before each retry, none after the final failure.
    expect(waited).toHaveLength(2)
    expect(waited[1]).toBeGreaterThan(waited[0])
  })

  it('passes the attempt number to the save so it can be logged', async () => {
    // Arrange
    const save = jest
      .fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })

    // Act
    await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(save).toHaveBeenNthCalledWith(1, 1)
    expect(save).toHaveBeenNthCalledWith(2, 2)
  })

  it('never exceeds a bounded total wait, so the confirmation screen cannot hang', async () => {
    // The customer is looking at "Order Placed!" while this runs. The retry
    // budget has to be small enough that the Messenger redirect still feels
    // immediate.
    const { DEFAULT_BACKOFF_MS } = jest.requireActual('@/lib/checkout/durable-order-save')
    const total = (DEFAULT_BACKOFF_MS as readonly number[]).reduce((a, b) => a + b, 0)

    expect(total).toBeLessThanOrEqual(2000)
  })
})

describe('saveOrderDurably — a refusal is not worth retrying', () => {
  // Retrying every failure was the right call while a refusal and a transport
  // failure were indistinguishable from an error string. Now the server says
  // which it is, so re-sending a deterministic "no" three times only computes
  // the same refusal twice more and delays the sentence the customer needs by
  // the full backoff budget.

  it('stops immediately when the store refuses the order', async () => {
    // Arrange
    const save = jest.fn().mockResolvedValue({
      success: false,
      refused: true,
      error: 'This order is below the minimum for checkout',
    })

    // Act
    const result = await saveOrderDurably(save, { sleep: noSleep })

    // Assert
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(1)
  })

  it('carries the refusal out so the caller can show it', async () => {
    const save = jest.fn().mockResolvedValue({
      success: false,
      refused: true,
      error: 'Sorry, Adobo just went out of stock.',
    })

    const result = await saveOrderDurably(save, { sleep: noSleep })

    expect(result.error).toBe('Sorry, Adobo just went out of stock.')
    expect(result.refused).toBe(true)
  })

  it('still retries a plain failure the full budget', async () => {
    // The transient case is unchanged — this is the one that saves orders.
    const save = jest.fn().mockResolvedValue({ success: false, error: 'network' })

    const result = await saveOrderDurably(save, { sleep: noSleep })

    expect(save).toHaveBeenCalledTimes(DEFAULT_SAVE_ATTEMPTS)
    expect(result.refused).toBeUndefined()
  })

  it('retries when `refused` is anything other than an explicit true', async () => {
    // Fail closed: a backend that has not been taught the discriminator keeps
    // exactly today's retry behaviour rather than silently losing its retries.
    const save = jest.fn().mockResolvedValue({ success: false, refused: undefined, error: 'x' })

    await saveOrderDurably(save, { sleep: noSleep })

    expect(save).toHaveBeenCalledTimes(DEFAULT_SAVE_ATTEMPTS)
  })

  it('does not treat a thrown error as a refusal', async () => {
    // A throw carries no verdict, so it stays retryable.
    const save = jest.fn().mockRejectedValue(new Error('boom'))

    const result = await saveOrderDurably(save, { sleep: noSleep })

    expect(save).toHaveBeenCalledTimes(DEFAULT_SAVE_ATTEMPTS)
    expect(result.refused).toBeUndefined()
  })
})
