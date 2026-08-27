/**
 * A revised order must PERSIST the delivery fee it totalled with.
 *
 * `reviseOrder` has always computed the new total FROM `args.deliveryFee`
 * (see computeRevisedTotal) but never patched the order's `deliveryFee`
 * field — so a fee corrected at the register changed the bill while the
 * stored breakdown kept the old figure, and every reader of the field
 * (receipts, order detail, exports) contradicted the total. The platform
 * backend fixed the same defect in webnegosyo-app's `buildRevisionRows`;
 * this is the Convex half.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { revisedDeliveryFeePatch } from '../../convex-template/convex/orderRevise'

describe('revisedDeliveryFeePatch', () => {
  it('patches the fee the total was computed with', () => {
    expect(revisedDeliveryFeePatch(80)).toEqual({ deliveryFee: 80 })
  })

  it('rounds to centavos, matching computeRevisedTotal', () => {
    expect(revisedDeliveryFeePatch(49.999)).toEqual({ deliveryFee: 50 })
  })

  it('clears the field when the revision has no fee', () => {
    // Patching undefined removes the field in Convex — the fee-less state,
    // matching the platform backend writing NULL.
    expect(revisedDeliveryFeePatch(0)).toEqual({ deliveryFee: undefined })
  })

  it('leaves the stored fee alone when the caller did not send one', () => {
    // Old app builds omit the argument entirely; blanking the fee for them
    // would re-bill every legacy edit without its delivery.
    expect(revisedDeliveryFeePatch(undefined)).toEqual({})
  })
})

describe('the reviseOrder mutation', () => {
  it('applies the fee patch beside the total', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'convex-template', 'convex', 'orders.ts'),
      'utf8',
    )
    expect(source).toMatch(/revisedDeliveryFeePatch\(args\.deliveryFee\)/)
  })
})
