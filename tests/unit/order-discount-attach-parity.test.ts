/**
 * Which codes an attach actually ADDS to a placed order.
 *
 * An order arriving in orders management already carries whatever discount it
 * was placed with. When a merchant attaches another code, exactly one question
 * decides whether money and a redemption are given away twice: which of the
 * lines now on the bill are NEW?
 *
 * Two ways to get it wrong, both live:
 *
 *   - Count a carried code again, and one voucher takes its discount off twice.
 *   - Burn a carried code again, and a second redemption is spent from the
 *     customer's own allowance for a voucher they presented once.
 *
 * Re-entering a code is an ordinary mistake, not an exotic one: the same
 * voucher gets handed over twice, or nobody recognises the label already on the
 * row.
 *
 * Manual lines are deliberately excluded. A manual discount is real money off
 * the bill with no voucher behind it, so there is nothing to redeem and nothing
 * that could be redeemed twice.
 *
 * Ported from `newDiscountLines` in `webnegosyo-app/lib/pos-edit-mode.ts`, which
 * the register has used since discounting a placed order shipped, and pinned
 * against it here.
 */
import { describe, it, expect } from '@jest/globals'
import { newDiscountLines as newOnWeb } from '@/lib/order-discount-attach'
import type { OrderDiscountLine } from '@/lib/order-totals'
import { newDiscountLines as newOnApp } from '../../webnegosyo-app/lib/pos-edit-mode'

const CARRIED: readonly OrderDiscountLine[] = [
  { label: 'FIRST20', amount: 20, code: 'FIRST20', voucherId: 'v-first' },
]

const codesOf = (lines: readonly OrderDiscountLine[]) => lines.map((line) => line.code)

// ---- What an attach actually adds ------------------------------------------

describe('selecting the codes an attach newly added', () => {
  it('returns a code the order did not already carry', () => {
    const fresh = newOnWeb(
      [{ label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }],
      CARRIED,
    )

    expect(codesOf(fresh)).toEqual(['SAVE20'])
  })

  /** The defect this exists for: re-entering a code already on the bill. */
  it('leaves out a code the order already carried', () => {
    expect(newOnWeb(CARRIED, CARRIED)).toEqual([])
  })

  it('keeps the new code and drops the carried one when both are present', () => {
    const fresh = newOnWeb(
      [...CARRIED, { label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }],
      CARRIED,
    )

    expect(codesOf(fresh)).toEqual(['SAVE20'])
  })

  it('returns nothing when the attach added no discount', () => {
    expect(newOnWeb([], CARRIED)).toEqual([])
  })

  it('returns every code when the order carried none', () => {
    const added = [
      { label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' },
      { label: 'FREEDEL', amount: 50, code: 'FREEDEL', voucherId: 'v-2' },
    ]

    expect(codesOf(newOnWeb(added, []))).toEqual(['SAVE20', 'FREEDEL'])
  })

  /**
   * A manual discount has no voucher behind it, so there is nothing to redeem —
   * and nothing that could be redeemed a second time.
   */
  it('leaves out a manual line, which has no code to redeem', () => {
    const added = [{ label: 'Manager discount', amount: 30 }]

    expect(newOnWeb(added, CARRIED)).toEqual([])
  })

  /**
   * Read from an untyped database edge. A line worth nothing, or worth NaN,
   * must not be treated as a discount that was applied.
   */
  it('leaves out a line worth nothing', () => {
    const added = [{ label: 'SAVE0', amount: 0, code: 'SAVE0', voucherId: 'v-0' }]

    expect(newOnWeb(added, CARRIED)).toEqual([])
  })

  it('leaves out a line whose amount is unreadable', () => {
    const added = [{ label: 'BAD', amount: Number.NaN, code: 'BAD', voucherId: 'v-x' }]

    expect(newOnWeb(added, CARRIED)).toEqual([])
  })

  it('leaves out a negative line, which would add money to the bill', () => {
    const added = [{ label: 'NEG', amount: -10, code: 'NEG', voucherId: 'v-n' }]

    expect(newOnWeb(added, CARRIED)).toEqual([])
  })

  /** A carried manual line has no code, so it must not mask a real one. */
  it('does not let a carried manual line suppress a new code', () => {
    const carriedManual = [{ label: 'Manager discount', amount: 30 }]
    const added = [{ label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }]

    expect(codesOf(newOnWeb(added, carriedManual))).toEqual(['SAVE20'])
  })

  it('does not mutate what it was given', () => {
    const added = [{ label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }]
    const addedBefore = [...added]

    newOnWeb(added, CARRIED)

    expect(added).toEqual(addedBefore)
  })
})

// ---- Parity with the register ---------------------------------------------

const CASES: ReadonlyArray<
  readonly [string, readonly OrderDiscountLine[], readonly OrderDiscountLine[]]
> = [
  ['nothing added', [], CARRIED],
  ['a fresh code', [{ label: 'SAVE20', amount: 40, code: 'SAVE20', voucherId: 'v-1' }], CARRIED],
  ['the carried code re-entered', CARRIED, CARRIED],
  ['a mix of carried and fresh', [...CARRIED, { label: 'S', amount: 5, code: 'S' }], CARRIED],
  ['a manual line', [{ label: 'Manager discount', amount: 30 }], CARRIED],
  ['a zero-amount line', [{ label: 'Z', amount: 0, code: 'Z' }], CARRIED],
  ['a NaN line', [{ label: 'N', amount: Number.NaN, code: 'N' }], CARRIED],
  ['a negative line', [{ label: 'M', amount: -10, code: 'M' }], CARRIED],
  ['an Infinity line', [{ label: 'I', amount: Number.POSITIVE_INFINITY, code: 'I' }], CARRIED],
  ['no carried lines at all', [{ label: 'SAVE20', amount: 40, code: 'SAVE20' }], []],
  ['carried lines with no codes', [{ label: 'SAVE20', amount: 40, code: 'SAVE20' }], [{ label: 'Manual', amount: 5 }]],
]

describe('attach selection parity — web vs merchant app', () => {
  it.each(CASES)('agrees on %s', (_label, added, carried) => {
    expect(newOnWeb(added, carried)).toEqual(newOnApp(added, carried))
  })
})
