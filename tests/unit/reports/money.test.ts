/**
 * Report money is whole centavos. Float pesos drift (0.1 + 0.2), and a report
 * whose rows don't add up to its total is a report nobody trusts.
 */
import { allocateCents, fromCents, toCents } from '@/lib/reports/money'

describe('toCents', () => {
  test('rounds half away from zero, including the float halves that sit just below .5', () => {
    expect(toCents(1.005)).toBe(101)
    expect(toCents(149.995)).toBe(15000)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(-1.005)).toBe(-101)
    expect(toCents(-0.004)).toBe(0)
  })

  test('reads Postgres numerics, which arrive as strings, exactly', () => {
    expect(toCents('1538.38')).toBe(153838)
    expect(toCents('0.00')).toBe(0)
    expect(toCents(' 12.5 ')).toBe(1250)
  })

  test('blank, missing or garbage is zero, never NaN', () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents('')).toBe(0)
    expect(toCents('abc')).toBe(0)
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  test('fromCents is the inverse', () => {
    expect(fromCents(153838)).toBe(1538.38)
    expect(fromCents(-5)).toBe(-0.05)
  })
})

describe('allocateCents', () => {
  test('shares always add up to the total, spare centavos to the largest remainders then the earliest', () => {
    expect(allocateCents(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(allocateCents(-1000, [1, 1, 1])).toEqual([-334, -333, -333])
    expect(allocateCents(300, [0, 0, 0])).toEqual([100, 100, 100])
    expect(allocateCents(300, [])).toEqual([])
  })

  test('equal remainders are decided by position, exactly, however large the shares (float division once broke these ties)', () => {
    // 3 × 2134/7206, 3 × 3737/7206, 3 × 1335/7206: the last two leave the SAME
    // remainder (4005/7206), so the earlier one wins. Float division read the
    // remainders as 0.5558… and 0.5558…+ε and gave the centavo to the last.
    expect(allocateCents(3, [2134, 3737, 1335])).toEqual([1, 2, 0])
    expect(allocateCents(8, [5723, 404, 2581])).toEqual([5, 1, 2])
    expect(allocateCents(-6, [582, 808, 89])).toEqual([-3, -3, 0])
  })

  test('negative or non-finite weights count as zero', () => {
    expect(allocateCents(100, [-5, 1, Number.NaN])).toEqual([0, 100, 0])
  })
})
