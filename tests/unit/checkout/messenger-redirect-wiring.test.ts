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
