/**
 * Client hook that keeps the storefront's open/closed state live.
 *
 * Two constraints drive the design:
 *
 *  1. The menu page is statically rendered with ISR (`revalidate = 300`), so any
 *     open/closed markup baked into the server HTML is up to five minutes stale and
 *     would also differ from what the client computes — a hydration mismatch. The
 *     hook therefore reports OPEN on the very first render and only reflects the
 *     real clock after mount.
 *  2. A customer can sit on the menu across the closing minute, so the status has to
 *     re-evaluate on a timer rather than once per navigation.
 */

import { renderHook, act } from '@testing-library/react'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import type { StoreHoursSource } from '@/lib/store-open-status'
import type { OperatingHours } from '@/lib/operating-hours'

const OPEN_WEEK: OperatingHours = {}
for (const key of ['0', '1', '2', '3', '4', '5', '6']) {
  OPEN_WEEK[key] = { closed: false, open: '09:00', close: '21:00' }
}

const ENFORCING: StoreHoursSource = {
  operating_hours: OPEN_WEEK,
  timezone: 'Asia/Manila',
  enforce_operating_hours: true,
}

// Monday in Manila: 23:00 (closed), and 09:00 (open).
const MON_2300 = new Date('2026-07-20T15:00:00Z')
const MON_0900 = new Date('2026-07-20T01:00:00Z')

describe('useStoreOpenStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('reports open on the first render so the ISR-cached HTML always hydrates cleanly', () => {
    jest.setSystemTime(MON_2300)
    const { result } = renderHook(() => useStoreOpenStatus(ENFORCING))
    // The value captured during the very first render pass, before effects flush.
    expect(result.all[0]).toMatchObject({ isOpen: true, isOrderingBlocked: false })
  })

  it('reflects the real clock after mount', () => {
    jest.setSystemTime(MON_2300)
    const { result } = renderHook(() => useStoreOpenStatus(ENFORCING))
    expect(result.current.isOrderingBlocked).toBe(true)
    expect(result.current.nextOpenLabel).toBe('tomorrow at 9:00 AM')
  })

  it('stays open after mount when the store is within its window', () => {
    jest.setSystemTime(MON_0900)
    const { result } = renderHook(() => useStoreOpenStatus(ENFORCING))
    expect(result.current.isOrderingBlocked).toBe(false)
  })

  it('flips to closed when the closing time passes while the page is open', () => {
    // 20:59 Manila — one minute before close.
    jest.setSystemTime(new Date('2026-07-20T12:59:00Z'))
    const { result } = renderHook(() => useStoreOpenStatus(ENFORCING))
    expect(result.current.isOrderingBlocked).toBe(false)

    act(() => {
      jest.setSystemTime(new Date('2026-07-20T13:01:00Z')) // 21:01 Manila
      jest.advanceTimersByTime(60_000)
    })

    expect(result.current.isOrderingBlocked).toBe(true)
  })

  it('never blocks a tenant that has not opted into enforcement', () => {
    jest.setSystemTime(MON_2300)
    const { result } = renderHook(() =>
      useStoreOpenStatus({ ...ENFORCING, enforce_operating_hours: false }),
    )
    expect(result.current.isOrderingBlocked).toBe(false)
  })

  it('tolerates a null tenant', () => {
    jest.setSystemTime(MON_2300)
    const { result } = renderHook(() => useStoreOpenStatus(null))
    expect(result.current.isOrderingBlocked).toBe(false)
  })
})
