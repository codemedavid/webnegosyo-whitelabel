import {
  MINUS,
  UNKNOWN_FIGURE,
  formatMoney,
  formatMoneyAxis,
  formatCount,
  formatRatio,
  formatSignedMoney,
} from '@/lib/reports/format'

describe('report number formatting', () => {
  test('summaries drop centavos; detail keeps them', () => {
    expect(formatMoney(8432050)).toBe('₱84,321')
    expect(formatMoney(8432049)).toBe('₱84,320')
    expect(formatMoney(12345, { centavos: true })).toBe('₱123.45')
  })

  test('negative money uses a true minus sign, never a hyphen', () => {
    expect(formatMoney(-150000)).toBe(`${MINUS}₱1,500`)
    expect(formatMoney(-5, { centavos: true })).toBe(`${MINUS}₱0.05`)
    expect(formatMoney(-0)).toBe('₱0')
  })

  test('an unknown value is a dash, never ₱0 or 0%', () => {
    expect(formatMoney(null)).toBe(UNKNOWN_FIGURE)
    expect(formatCount(null)).toBe(UNKNOWN_FIGURE)
    expect(formatRatio(null)).toBe(UNKNOWN_FIGURE)
  })

  test('signed money always shows its sign', () => {
    expect(formatSignedMoney(250000)).toBe('+₱2,500')
    expect(formatSignedMoney(-250000)).toBe(`${MINUS}₱2,500`)
    expect(formatSignedMoney(0)).toBe('₱0')
  })

  test('compact pesos only on chart axes', () => {
    expect(formatMoneyAxis(120000000)).toBe('₱1.2M')
    expect(formatMoneyAxis(450000)).toBe('₱4.5K')
    expect(formatMoneyAxis(50000)).toBe('₱500')
  })

  test('counts and ratios', () => {
    expect(formatCount(12345)).toBe('12,345')
    expect(formatRatio(0.1234)).toBe('12%')
    expect(formatRatio(0.0567, { digits: 1 })).toBe('5.7%')
    expect(formatRatio(-0.25)).toBe(`${MINUS}25%`)
  })
})
