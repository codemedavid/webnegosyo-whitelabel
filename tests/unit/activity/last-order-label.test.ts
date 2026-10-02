import { daysSinceLastOrder, lastOrderLabel } from '@/lib/activity/last-order-label'

/** 2026-09-29 14:00 in Manila. */
const NOW = '2026-09-29T06:00:00.000Z'

describe('lastOrderLabel', () => {
  it.each([
    ['2026-09-29T01:00:00.000Z', 'Today'],
    // 23:30 on the 28th in Manila is yesterday there, even though it is the
    // 28th in UTC for only half an hour.
    ['2026-09-28T15:30:00.000Z', 'Yesterday'],
    ['2026-09-24T03:00:00.000Z', '5 days ago'],
    ['2026-09-01T03:00:00.000Z', '4 weeks ago'],
    ['2026-06-15T03:00:00.000Z', '3 months ago'],
    ['2024-06-15T03:00:00.000Z', 'Over a year ago'],
  ])('describes %s as %s', (iso, label) => {
    expect(lastOrderLabel(iso, NOW)).toBe(label)
  })

  it('says so when there has never been an order', () => {
    expect(lastOrderLabel(null, NOW)).toBe('Never')
  })

  it('does not crash on a corrupt timestamp', () => {
    expect(lastOrderLabel('nonsense', NOW)).toBe('Never')
  })
})

describe('daysSinceLastOrder', () => {
  it('counts Manila days', () => {
    expect(daysSinceLastOrder('2026-09-28T15:30:00.000Z', NOW)).toBe(1)
  })

  it('is null without an order', () => {
    expect(daysSinceLastOrder(null, NOW)).toBeNull()
  })
})
