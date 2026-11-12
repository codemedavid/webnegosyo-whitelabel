import { formatOrderDate, formatTime } from './format'

const MANILA = 'Asia/Manila'
const NOW = new Date('2026-09-30T04:00:00Z') // 12:00 noon in Manila

describe('formatOrderDate', () => {
  it('says Today for an order placed today in the store time zone', () => {
    expect(formatOrderDate('2026-09-30T02:10:00Z', NOW, MANILA)).toBe('Today, 10:10 AM')
  })

  it('says Yesterday for the day before', () => {
    expect(formatOrderDate('2026-09-29T02:10:00Z', NOW, MANILA)).toBe('Yesterday, 10:10 AM')
  })

  it('falls back to a short date', () => {
    expect(formatOrderDate('2026-09-20T02:10:00Z', NOW, MANILA)).toBe('Sep 20, 10:10 AM')
  })

  it('crosses midnight by the store clock, not UTC', () => {
    // 23:30 UTC on the 29th is 07:30 on the 30th in Manila.
    expect(formatOrderDate('2026-09-29T23:30:00Z', NOW, MANILA)).toBe('Today, 7:30 AM')
  })
})

describe('formatTime', () => {
  it('formats a clock time', () => {
    expect(formatTime('2026-09-30T02:25:00Z', MANILA)).toBe('10:25 AM')
  })
})
