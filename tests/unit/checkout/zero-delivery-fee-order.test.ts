/**
 * A legitimately free delivery (a ₱0 quote) must reach the saved order.
 *
 * `validDeliveryFeeForOrder` tested `deliveryFee && …`, so a ₱0 fee was
 * falsy and the order was saved with NO fee at all, while the summary the
 * customer saw — built from `validDeliveryFee`, which tests
 * `deliveryFee !== null` — showed ₱0.
 *
 * The declaration moved out of useCheckout into the pure
 * `resolveQuoteForOrder` (src/lib/checkout/order-submit-fields.ts), which
 * useCheckout calls for the fee it sends. Pinned both ways: the source line,
 * and the behaviour itself.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveQuoteForOrder } from '@/lib/checkout/order-submit-fields'

const SOURCE = readFileSync(join(process.cwd(), 'src/lib/checkout/order-submit-fields.ts'), 'utf8')
const HOOK_SOURCE = readFileSync(join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

function declarationOf(name: string): string {
  const line = SOURCE.split('\n').find((candidate) => candidate.includes(`const ${name} =`))
  expect(line).toBeDefined()
  return line as string
}

describe('the delivery fee sent with the order', () => {
  it('treats ₱0 as a fee, the same way the summary does', () => {
    expect(declarationOf('validDeliveryFeeForOrder')).toMatch(/deliveryFee !== null/)
  })

  it('does not gate the fee on truthiness', () => {
    expect(declarationOf('validDeliveryFeeForOrder')).not.toMatch(/\(deliveryFee &&/)
  })

  it('sends a ₱0 quote for the current address as a ₱0 fee', () => {
    const quote = resolveQuoteForOrder({
      deliveryFee: 0,
      quotationId: null,
      quoteSignature: null,
      quotedAddress: 'Manila',
      currentAddress: 'Manila',
    })

    expect(quote.deliveryFee).toBe(0)
  })

  it('is the resolver the checkout hook actually uses for the order', () => {
    expect(HOOK_SOURCE).toContain('resolveQuoteForOrder(')
    expect(HOOK_SOURCE).toContain('quote.deliveryFee')
  })
})
