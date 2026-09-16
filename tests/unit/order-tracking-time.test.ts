import {
  ORDER_TRACKING_TIME_ZONE,
  formatOrderTrackingTime,
} from '@/lib/order-tracking-time'

describe('formatOrderTrackingTime', () => {
  it('renders the same Philippine wall time on the server and in the browser', () => {
    const originalTimeZone = process.env.TZ

    try {
      process.env.TZ = 'UTC'
      const serverText = formatOrderTrackingTime('2026-09-16T07:30:00.000Z')

      process.env.TZ = 'Asia/Manila'
      const browserText = formatOrderTrackingTime('2026-09-16T07:30:00.000Z')

      expect(ORDER_TRACKING_TIME_ZONE).toBe('Asia/Manila')
      expect(serverText).toBe('Sep 16, 3:30 PM')
      expect(browserText).toBe(serverText)
    } finally {
      process.env.TZ = originalTimeZone
    }
  })

  it('keeps the existing empty label for an invalid timestamp', () => {
    expect(formatOrderTrackingTime('not-a-date')).toBe('')
  })
})
