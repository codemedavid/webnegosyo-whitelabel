/**
 * Where the fix has to actually land: the checkout hook.
 *
 * `saveOrderDurably` and `awaitSaveBeforeRedirect` are proved in isolation by
 * their own suites. They only stop the merchant losing orders if `useCheckout`
 * is the code that calls them, so this suite reads the hook's source and pins
 * the three properties that made the bug possible.
 *
 * A source-level assertion is a blunt instrument, chosen because `useCheckout`
 * is a 1,500-line hook with a large dependency surface that no unit test in
 * this repo renders end to end. It is pinned narrowly: each assertion names a
 * specific defect that was observed in production.
 */

import fs from 'fs'
import path from 'path'

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/useCheckout.ts'),
  'utf8'
)

describe('useCheckout — the Messenger redirect must not outrun the order save', () => {
  it('waits for the save to settle before opening the Messenger deep link', () => {
    // The defect: `window.open(m.me/...)` ran on a bare 3-second timer. On a
    // phone the deep link freezes the tab and abandons the in-flight save.
    expect(SOURCE).toContain('awaitSaveBeforeRedirect')

    const wait = SOURCE.indexOf('awaitSaveBeforeRedirect(')
    const open = SOURCE.indexOf('window.open(')
    expect(wait).toBeGreaterThan(-1)
    expect(open).toBeGreaterThan(-1)
    expect(wait).toBeLessThan(open)
  })

  it('retries the order save instead of firing it once and hoping', () => {
    // `client_order_id` makes the retry safe; nothing was using it.
    expect(SOURCE).toContain('saveOrderDurably')
  })

  it('tells the customer when the order could not be confirmed', () => {
    // The old failure path was a lone console.warn, so a lost order was
    // invisible to the customer, the merchant, and the logs anyone reads.
    expect(SOURCE).not.toContain("console.warn('[Checkout] Background order save failed:'")
    expect(SOURCE).toMatch(/orderSaveFailed|setOrderSaveError/)
  })
})

describe('useCheckout — a refused order must not be handed to the merchant', () => {
  // The store refusing an order and the order going missing are opposite
  // events. The hook used to treat them as one, which meant a customer whose
  // order was DELIBERATELY rejected was told to send the merchant the
  // Messenger message anyway — and the countdown sent it for them.

  it('classifies the save instead of assuming every failure is a lost order', () => {
    expect(SOURCE).toContain('classifyOrderSave')
  })

  it('no longer hardcodes the one-size-fits-all failure sentence', () => {
    // The generic wording still exists, but it now lives in the classifier as
    // the FAILURE case only, not inline as the answer to everything.
    expect(SOURCE).not.toContain(
      "'We could not confirm your order with the store. Please send the Messenger message so they receive it.'"
    )
  })

  it('stops the countdown from opening Messenger when the store refused', () => {
    expect(SOURCE).toContain('orderRefusedRef')

    const guard = SOURCE.indexOf('orderRefusedRef.current) return')
    const open = SOURCE.indexOf('window.open(')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(open)
  })

  it('carries the reason out of the hook so a design can show it', () => {
    expect(SOURCE).toContain('orderSaveNotice')
  })
})
