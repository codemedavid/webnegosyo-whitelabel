/**
 * A legitimately free delivery (a ₱0 quote) must reach the saved order.
 *
 * `validDeliveryFeeForOrder` tested `deliveryFee && …`, so a ₱0 fee was
 * falsy and the order was saved with NO fee at all, while the summary the
 * customer saw — built from `validDeliveryFee`, which tests
 * `deliveryFee !== null` — showed ₱0. Source-level because useCheckout is a
 * 1,700-line hook with no seam at this line.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = readFileSync(join(process.cwd(), 'src/hooks/useCheckout.ts'), 'utf8')

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
})
