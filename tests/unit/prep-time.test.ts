import { describePrepPromise, formatPromisedClock } from '@/lib/prep-time'

/**
 * What the customer sees while their food is being cooked.
 *
 * The rule the whole feature rests on: the countdown is derived from an
 * absolute promised instant, never from a stored duration. A duration has no
 * way to know when the clock started, so it would read "15 minutes" forever.
 */

const MINUTE = 60_000
// 11:10 UTC = 7:10 PM in Manila.
const NOW = Date.UTC(2026, 7, 29, 11, 10, 0)
const iso = (ms: number) => new Date(ms).toISOString()

describe('formatPromisedClock', () => {
  it('renders the promised instant as a wall clock', () => {
    expect(formatPromisedClock(iso(Date.UTC(2026, 7, 29, 11, 21, 0)), 'Asia/Manila')).toBe(
      '7:21 PM'
    )
  })

  it('returns null for an unparseable timestamp rather than "Invalid Date"', () => {
    expect(formatPromisedClock('not-a-date', 'Asia/Manila')).toBeNull()
  })
})

describe('describePrepPromise', () => {
  const base = {
    nowMs: NOW,
    orderTypeKind: 'pickup' as const,
    timeZone: 'Asia/Manila',
  }

  it('shows nothing before the kitchen has committed to a time', () => {
    expect(
      describePrepPromise({ ...base, promisedReadyAt: null, status: 'confirmed' })
    ).toBeNull()
  })

  it('shows the target time and the rounded wait once the chef commits', () => {
    // Arrange — chef promised 7:21 PM; it is 7:10 PM.
    const promisedReadyAt = iso(NOW + 11 * MINUTE)

    // Act
    const view = describePrepPromise({ ...base, promisedReadyAt, status: 'preparing' })

    // Assert
    expect(view).toEqual({
      tone: 'eta',
      headline: 'Ready by 7:21 PM',
      detail: 'about 11 min',
    })
  })

  it('promises the kitchen, not the doorstep, on a delivery order', () => {
    // The kitchen controls when food leaves; it does not control the road.
    const view = describePrepPromise({
      ...base,
      orderTypeKind: 'delivery',
      promisedReadyAt: iso(NOW + 11 * MINUTE),
      status: 'preparing',
    })

    expect(view?.headline).toBe('Leaves the kitchen by 7:21 PM')
  })

  it('never shows a negative number when the kitchen runs over', () => {
    // Arrange — promised 7:05, still cooking at 7:10.
    const view = describePrepPromise({
      ...base,
      promisedReadyAt: iso(NOW - 5 * MINUTE),
      status: 'preparing',
    })

    // Assert — the words change, the number does not go negative.
    expect(view).toEqual({
      tone: 'late',
      headline: 'Almost there',
      detail: 'Running a little behind',
    })
  })

  it('softens the last minute rather than counting to zero', () => {
    const view = describePrepPromise({
      ...base,
      promisedReadyAt: iso(NOW + 20_000),
      status: 'preparing',
    })

    expect(view?.detail).toBe('Any moment now')
  })

  it('drops the estimate once the food is actually ready', () => {
    // Reality supersedes the estimate — the stepper already says Ready.
    expect(
      describePrepPromise({
        ...base,
        promisedReadyAt: iso(NOW + 5 * MINUTE),
        status: 'ready',
      })
    ).toBeNull()
  })

  it('drops the estimate on a cancelled order', () => {
    expect(
      describePrepPromise({
        ...base,
        promisedReadyAt: iso(NOW + 5 * MINUTE),
        status: 'cancelled',
      })
    ).toBeNull()
  })

  it('ignores a promise attached to an order still awaiting confirmation', () => {
    // Nothing should be promised before the store has accepted the order.
    expect(
      describePrepPromise({
        ...base,
        promisedReadyAt: iso(NOW + 5 * MINUTE),
        status: 'pending',
      })
    ).toBeNull()
  })
})
