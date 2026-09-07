/**
 * The gate between "Order Placed!" and the Messenger deep link.
 *
 * Reported symptom: the customer lands in Messenger and the merchant reads the
 * order there, but no row exists in the database, so it never reaches the admin
 * queue, the kitchen, inventory, or analytics.
 *
 * Mechanism: the 3-second countdown that calls `window.open(m.me/...)` ran on a
 * timer that knew nothing about the background save. On a phone the deep link
 * hands control to the Messenger app, the checkout tab is frozen, and the
 * in-flight save is abandoned mid-request.
 *
 * The rule this encodes: never leave the page while the order row is still
 * being written — but never trap the customer either, and never withhold the
 * Messenger message when the save has genuinely failed, because that message is
 * the merchant's fallback copy of the order.
 */

import {
  awaitSaveBeforeRedirect,
  REDIRECT_WAIT_CEILING_MS,
} from '@/lib/checkout/messenger-redirect-gate'

describe('awaitSaveBeforeRedirect', () => {
  it('resolves as soon as the save settles', async () => {
    // Arrange
    const save = Promise.resolve<'saved'>('saved')

    // Act
    const outcome = await awaitSaveBeforeRedirect(save, { ceilingMs: 5000 })

    // Assert
    expect(outcome).toBe('saved')
  })

  it('reports a failed save rather than throwing', async () => {
    // Arrange
    const save = Promise.reject(new Error('boom'))

    // Act
    const outcome = await awaitSaveBeforeRedirect(save, { ceilingMs: 5000 })

    // Assert
    expect(outcome).toBe('failed')
  })

  it('gives up at the ceiling when the save never settles', async () => {
    // Arrange — a promise that never resolves, i.e. a hung server action.
    const never = new Promise<'saved'>(() => {})

    // Act
    const outcome = await awaitSaveBeforeRedirect(never, { ceilingMs: 10 })

    // Assert
    expect(outcome).toBe('timed-out')
  })

  it('treats a missing save as nothing to wait for', async () => {
    expect(await awaitSaveBeforeRedirect(null, { ceilingMs: 10 })).toBe('untracked')
  })

  it('has a ceiling short enough to stay a checkout, not a wait', () => {
    expect(REDIRECT_WAIT_CEILING_MS).toBeGreaterThanOrEqual(3000)
    expect(REDIRECT_WAIT_CEILING_MS).toBeLessThanOrEqual(15000)
  })
})
