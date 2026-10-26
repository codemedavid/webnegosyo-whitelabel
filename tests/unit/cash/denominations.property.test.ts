/**
 * Properties of the denomination engine: a valid count's total is exactly
 * Σ count × face value (+ loose coins), in integer centavos; anything outside
 * the contract shape is refused rather than totalled.
 */
import fc from 'fast-check'

import {
  DENOMINATION_KEYS,
  LOOSE_COINS_KEY,
  MAX_LOOSE_COINS_CENTS,
  MAX_PIECES,
  PH_DENOMINATIONS,
  countTotalCents,
  isValidCounts,
  parseCounts,
  setCount,
} from '@/lib/cash/denominations'
import { propertyParameters } from '../../utils/property'

const validCounts = fc.record(
  {
    ...Object.fromEntries(DENOMINATION_KEYS.map((key) => [key, fc.integer({ min: 0, max: MAX_PIECES })])),
    [LOOSE_COINS_KEY]: fc.integer({ min: 0, max: MAX_LOOSE_COINS_CENTS }),
  },
  { requiredKeys: [] },
)

describe('denomination properties', () => {
  it('total = Σ count × cents (+ loose coins), always a safe integer', () => {
    fc.assert(
      fc.property(validCounts, (counts) => {
        const record = counts as Record<string, number>
        const expected =
          PH_DENOMINATIONS.reduce((sum, d) => sum + (record[d.key] ?? 0) * d.cents, 0) +
          (record[LOOSE_COINS_KEY] ?? 0)
        expect(isValidCounts(counts)).toBe(true)
        expect(countTotalCents(counts)).toBe(expected)
        expect(Number.isSafeInteger(expected)).toBe(true)
        expect(countTotalCents(parseCounts(counts))).toBe(expected)
      }),
      propertyParameters(),
    )
  })

  it('an unknown key anywhere makes the whole count invalid', () => {
    const unknownKey = fc
      .string({ minLength: 1, maxLength: 12 })
      .filter((key) => !(DENOMINATION_KEYS as readonly string[]).includes(key) && key !== LOOSE_COINS_KEY)
      .filter((key) => key !== '__proto__')
    fc.assert(
      fc.property(validCounts, unknownKey, fc.integer({ min: 0, max: 10 }), (counts, key, value) => {
        const bad = { ...counts, [key]: value }
        expect(isValidCounts(bad)).toBe(false)
        expect(countTotalCents(bad)).toBeNull()
        expect(parseCounts(bad)).toBeNull()
      }),
      propertyParameters(),
    )
  })

  it('a non-integer, negative or over-cap count is refused', () => {
    const badValue = fc.oneof(
      fc.integer({ min: -MAX_PIECES, max: -1 }),
      fc.integer({ min: MAX_PIECES + 1, max: Number.MAX_SAFE_INTEGER }),
      fc.double({ noInteger: true }),
      fc.string(),
      fc.boolean(),
      fc.constant(null),
    )
    fc.assert(
      fc.property(validCounts, fc.constantFrom(...DENOMINATION_KEYS), badValue, (counts, key, value) => {
        expect(isValidCounts({ ...counts, [key]: value })).toBe(false)
      }),
      propertyParameters(),
    )
  })

  it('setCount always yields a valid count and never mutates its input', () => {
    fc.assert(
      fc.property(validCounts, fc.constantFrom(...DENOMINATION_KEYS), fc.integer(), (counts, key, value) => {
        const snapshot = JSON.stringify(counts)
        const next = setCount(counts, key, value)
        expect(isValidCounts(next)).toBe(true)
        expect(JSON.stringify(counts)).toBe(snapshot)
      }),
      propertyParameters(),
    )
  })
})
