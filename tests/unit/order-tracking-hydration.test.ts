import { readFileSync } from 'fs'
import { join } from 'path'
import { describePrepPromise } from '@/lib/prep-time'
import { ORDER_TRACKING_TIME_ZONE } from '@/lib/order-tracking-time'

/**
 * Regression for the tracking page's hydration error (Sentry JAVASCRIPT-NEXTJS-2J).
 *
 * The page is server-rendered on a UTC host and hydrated on a phone in
 * Asia/Manila. Any clock the page prints without a pinned time zone — and any
 * `Date.now()` read during render — produces server HTML the browser cannot
 * match. The prep promise ("Ready by 7:21 PM") was the one doing both.
 */

const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

/** 7:21 PM in Manila; 11:21 AM in UTC — a zone mistake is unmissable. */
const PROMISED_READY_AT = '2026-09-16T11:21:00.000Z'

const promise = {
  promisedReadyAt: PROMISED_READY_AT,
  status: 'preparing',
  nowMs: Date.parse('2026-09-16T11:00:00.000Z'),
}

describe('prep promise prints one wall clock for every runtime', () => {
  it('reads the same on a UTC server and a Manila browser', () => {
    // Arrange
    const originalTimeZone = process.env.TZ

    try {
      // Act
      process.env.TZ = 'UTC'
      const serverView = describePrepPromise({ ...promise, timeZone: ORDER_TRACKING_TIME_ZONE })

      process.env.TZ = 'Asia/Manila'
      const browserView = describePrepPromise({ ...promise, timeZone: ORDER_TRACKING_TIME_ZONE })

      // Assert
      expect(serverView?.headline).toBe('Ready by 7:21 PM')
      expect(browserView?.headline).toBe(serverView?.headline)
    } finally {
      process.env.TZ = originalTimeZone
    }
  })

  it('shows the shape of the bug: an unpinned zone prints a different time', () => {
    // Arrange / Act
    const asUtc = describePrepPromise({ ...promise, timeZone: 'UTC' })
    const asManila = describePrepPromise({ ...promise, timeZone: ORDER_TRACKING_TIME_ZONE })

    // Assert
    expect(asUtc?.headline).not.toBe(asManila?.headline)
  })
})

describe('order tracking client pins every clock it renders', () => {
  const source = read('src/app/[tenant]/order/[orderId]/order-tracking-client.tsx')

  it('pins the market time zone on the prep promise', () => {
    // Assert
    expect(source).toMatch(/timeZone:\s*ORDER_TRACKING_TIME_ZONE/)
    expect(source).toMatch(/ORDER_TRACKING_TIME_ZONE.*from '@\/lib\/order-tracking-time'/)
  })

  it('adopts the device clock after mount rather than during render', () => {
    // Arrange — comments explain the rule; only real calls can break it.
    const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

    // Assert — the only Date.now() call in the file is the post-mount adoption.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*setDeviceNowMs\(Date\.now\(\)\)/)
    expect(code.match(/Date\.now\(\)/g) ?? []).toHaveLength(1)
    expect(source).not.toMatch(/\?\?\s*Date\.now\(\)/)
  })
})
