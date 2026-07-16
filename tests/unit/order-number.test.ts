import { formatDailyOrderNumber } from '@/lib/order-number'

describe('formatDailyOrderNumber', () => {
  it('zero-pads single-digit numbers to two digits with a # prefix', () => {
    expect(formatDailyOrderNumber(1)).toBe('#01')
    expect(formatDailyOrderNumber(9)).toBe('#09')
  })

  it('renders two-digit numbers as-is', () => {
    expect(formatDailyOrderNumber(42)).toBe('#42')
  })

  it('grows naturally past 100 without extra padding', () => {
    expect(formatDailyOrderNumber(100)).toBe('#100')
    expect(formatDailyOrderNumber(237)).toBe('#237')
  })

  it('falls back to a shortened uppercased UUID slice when no daily number exists', () => {
    expect(formatDailyOrderNumber(undefined, '12ab34cd-5678-90ef-1234-567890abcdef')).toBe('#12AB34CD')
    expect(formatDailyOrderNumber(null, '12ab34cd-5678-90ef-1234-567890abcdef')).toBe('#12AB34CD')
  })

  it('prefers the daily number over the fallback id when both are present', () => {
    expect(formatDailyOrderNumber(7, '12ab34cd-5678')).toBe('#07')
  })

  it('returns an empty string when neither a number nor a fallback id is available', () => {
    expect(formatDailyOrderNumber(undefined)).toBe('')
    expect(formatDailyOrderNumber(null, '')).toBe('')
  })

  it('ignores a zero or negative daily number and uses the fallback instead', () => {
    expect(formatDailyOrderNumber(0, '12ab34cd-5678')).toBe('#12AB34CD')
    expect(formatDailyOrderNumber(-3, '12ab34cd-5678')).toBe('#12AB34CD')
  })
})
