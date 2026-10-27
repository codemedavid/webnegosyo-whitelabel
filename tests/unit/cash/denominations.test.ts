/**
 * The PH denomination engine behind the drawer count (CONTRACTS §2, §5).
 *
 * The same JSON object is stored on `staff_shifts.opening_denominations` /
 * `closing_denominations` and totalled by SQL `cash.denominations_total_cents`,
 * so the cases here are the ones the SQL twin must agree with: keys exactly
 * `b1000 … c001`, counts whole numbers 0–100000 per denomination, optional
 * `loose_coins_cents`, anything else refused.
 *
 * No shared `tests/fixtures/cash-denominations-cases.json` existed when this
 * was written, so the cases live here (CASES below); a SQL runner can import
 * this table's shape verbatim.
 */
import {
  DENOMINATION_KEYS,
  EMPTY_COUNTS,
  LOOSE_COINS_KEY,
  MAX_LOOSE_COINS_CENTS,
  MAX_PIECES,
  PH_DENOMINATIONS,
  countTotalCents,
  denominationByKey,
  isValidCounts,
  lineCents,
  parseCounts,
  pieceCounts,
  pressCountKey,
  setCount,
  setLooseCoinsCents,
  stepCount,
  usesLooseCoins,
} from '@/lib/cash/denominations'

interface TotalCase {
  name: string
  counts: unknown
  totalCents: number | null
}

const CASES: readonly TotalCase[] = [
  { name: 'empty object', counts: {}, totalCents: 0 },
  { name: 'one of each bill', counts: { b1000: 1, b500: 1, b200: 1, b100: 1, b50: 1, b20: 1 }, totalCents: 187000 },
  { name: 'one of each coin', counts: { c20: 1, c10: 1, c5: 1, c1: 1, c025: 1, c005: 1, c001: 1 }, totalCents: 3631 },
  { name: '₱20 bill and ₱20 coin are separate rows', counts: { b20: 2, c20: 3 }, totalCents: 10000 },
  {
    name: 'the slip in 06 §4.3',
    counts: { b1000: 4, b500: 3, b100: 7, b50: 6, b20: 9, c10: 12, c5: 8, c1: 23, c025: 4 },
    totalCents: 4000_00 + 1500_00 + 700_00 + 300_00 + 180_00 + 120_00 + 40_00 + 23_00 + 1_00,
  },
  { name: 'loose coins counted by total', counts: { b100: 2, loose_coins_cents: 4575 }, totalCents: 24575 },
  { name: 'zero counts are fine', counts: { b1000: 0, c001: 0 }, totalCents: 0 },
  { name: 'the piece cap itself', counts: { c001: MAX_PIECES }, totalCents: MAX_PIECES },
  { name: 'over the piece cap', counts: { c001: MAX_PIECES + 1 }, totalCents: null },
  { name: 'unknown key', counts: { b2000: 1 }, totalCents: null },
  { name: 'old numeric key (07 draft) refused', counts: { '100000': 1 }, totalCents: null },
  { name: 'negative count', counts: { b100: -1 }, totalCents: null },
  { name: 'fractional count', counts: { b100: 1.5 }, totalCents: null },
  { name: 'string count', counts: { b100: '3' }, totalCents: null },
  { name: 'NaN count', counts: { b100: Number.NaN }, totalCents: null },
  { name: 'boolean count', counts: { b100: true }, totalCents: null },
  { name: 'null count', counts: { b100: null }, totalCents: null },
  { name: 'negative loose coins', counts: { loose_coins_cents: -5 }, totalCents: null },
  { name: 'loose coins over cap', counts: { loose_coins_cents: MAX_LOOSE_COINS_CENTS + 1 }, totalCents: null },
  { name: 'array', counts: [1, 2], totalCents: null },
  { name: 'null', counts: null, totalCents: null },
  { name: 'string', counts: '{"b100":1}', totalCents: null },
  { name: 'number', counts: 5, totalCents: null },
]

describe('PH_DENOMINATIONS', () => {
  it('lists exactly the contract keys, bills first then coins, biggest first', () => {
    expect(PH_DENOMINATIONS.map((d) => d.key)).toEqual([
      'b1000', 'b500', 'b200', 'b100', 'b50', 'b20',
      'c20', 'c10', 'c5', 'c1', 'c025', 'c005', 'c001',
    ])
    expect(DENOMINATION_KEYS).toEqual(PH_DENOMINATIONS.map((d) => d.key))
  })

  it('values every row in whole centavos, matching its key', () => {
    expect(PH_DENOMINATIONS.map((d) => d.cents)).toEqual([
      100000, 50000, 20000, 10000, 5000, 2000, 2000, 1000, 500, 100, 25, 5, 1,
    ])
    for (const d of PH_DENOMINATIONS) expect(d.kind).toBe(d.key.startsWith('b') ? 'bill' : 'coin')
  })

  it('labels coins under a peso in centavos and marks 5¢ and 1¢ as "more coins"', () => {
    expect(denominationByKey('c025').label).toBe('25¢')
    expect(denominationByKey('b1000').label).toBe('₱1000')
    expect(PH_DENOMINATIONS.filter((d) => d.isMoreCoins).map((d) => d.key)).toEqual(['c005', 'c001'])
    expect(denominationByKey('b20').pluralLabel).toBe('₱20 bills')
    expect(denominationByKey('c20').pluralLabel).toBe('₱20 coins')
  })
})

describe('countTotalCents / isValidCounts / parseCounts', () => {
  it.each(CASES)('$name', ({ counts, totalCents }) => {
    expect(isValidCounts(counts)).toBe(totalCents !== null)
    expect(countTotalCents(counts)).toBe(totalCents)
    const parsed = parseCounts(counts)
    if (totalCents === null) expect(parsed).toBeNull()
    else expect(countTotalCents(parsed)).toBe(totalCents)
  })

  it('parseCounts keeps only non-zero rows and never returns the input object', () => {
    const input = { b100: 2, c1: 0, loose_coins_cents: 0 }
    const parsed = parseCounts(input)
    expect(parsed).toEqual({ b100: 2 })
    expect(parsed).not.toBe(input)
  })
})

describe('editing counts (immutable)', () => {
  it('setCount returns a new object and leaves the old one alone', () => {
    const before = { b100: 1 }
    const after = setCount(before, 'b100', 5)
    expect(after).toEqual({ b100: 5 })
    expect(before).toEqual({ b100: 1 })
  })

  it('setCount clamps to 0…MAX_PIECES and drops a zero row', () => {
    expect(setCount({ b100: 3 }, 'b100', 0)).toEqual({})
    expect(setCount({}, 'b100', -4)).toEqual({})
    expect(setCount({}, 'b100', MAX_PIECES + 9)).toEqual({ b100: MAX_PIECES })
    expect(setCount({}, 'b100', 2.7)).toEqual({ b100: 2 })
  })

  it('stepCount adds or removes one piece, never below zero', () => {
    expect(stepCount(EMPTY_COUNTS, 'c10', 1)).toEqual({ c10: 1 })
    expect(stepCount({ c10: 1 }, 'c10', -1)).toEqual({})
    expect(stepCount({}, 'c10', -1)).toEqual({})
  })

  it('setLooseCoinsCents stores a whole-centavo total, null clears it', () => {
    expect(setLooseCoinsCents({ b20: 1 }, 4550)).toEqual({ b20: 1, [LOOSE_COINS_KEY]: 4550 })
    expect(setLooseCoinsCents({ b20: 1, loose_coins_cents: 9 }, null)).toEqual({ b20: 1 })
    expect(usesLooseCoins({ loose_coins_cents: 1 })).toBe(true)
    expect(usesLooseCoins({ c1: 3 })).toBe(false)
  })

  it('lineCents and pieceCounts', () => {
    expect(lineCents('c025', 8)).toBe(200)
    expect(pieceCounts({ b1000: 5, b20: 1, c20: 4, c1: 23 })).toEqual({ bills: 6, coins: 27 })
  })
})

describe('pressCountKey (the count keypad)', () => {
  it('appends digits, drops leading zeros and caps at MAX_PIECES', () => {
    expect(pressCountKey(0, '7')).toBe(7)
    expect(pressCountKey(7, '0')).toBe(70)
    expect(pressCountKey(0, '0')).toBe(0)
    expect(pressCountKey(1, '00')).toBe(100)
    expect(pressCountKey(MAX_PIECES, '1')).toBe(MAX_PIECES)
    expect(pressCountKey(99999, '9')).toBe(99999)
  })

  it('backspace removes the last digit, clear empties it', () => {
    expect(pressCountKey(123, 'backspace')).toBe(12)
    expect(pressCountKey(5, 'backspace')).toBe(0)
    expect(pressCountKey(123, 'clear')).toBe(0)
  })
})
