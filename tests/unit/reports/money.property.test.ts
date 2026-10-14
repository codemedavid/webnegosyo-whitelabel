/**
 * `allocateCents` is the merchant app's bill-split rule; the web report copy
 * must split every amount exactly as the app does, and always add back up to
 * the total. fast-check found the one place they differed (a -0 share from a
 * negative total), fixed in the app on 2026-10-14.
 */
import fc from 'fast-check'
import { allocateCents } from '@/lib/reports/money'
import { allocateCents as appAllocateCents } from '../../../webnegosyo-app/lib/bill/money'
import { propertyParameters } from '../../utils/property'

describe('allocateCents (property)', () => {
  test('splits every amount exactly as the merchant app does, adding back to the total', () => {
    const weight = fc.integer({ min: 0, max: 5_000_000 }).map((centavos) => centavos / 100)
    fc.assert(
      fc.property(
        fc.integer({ min: -300_000, max: 700_000 }),
        fc.array(weight, { minLength: 1, maxLength: 8 }),
        (total, weights) => {
          const shares = allocateCents(total, weights)
          expect(shares).toEqual(appAllocateCents(total, weights))
          expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
        },
      ),
      propertyParameters(),
    )
  })
})
