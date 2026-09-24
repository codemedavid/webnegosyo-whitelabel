/**
 * The tracking page polled every 5-10 s forever: in a backgrounded tab, on a
 * locked phone, and at full rate straight through an outage. The poll now
 * sleeps while the page is hidden, catches up the moment it is shown again,
 * and backs off on consecutive failures.
 */
import { act, renderHook } from '@testing-library/react'
import { computePollDelayMs, MAX_POLL_BACKOFF_MS } from '@/lib/poll-backoff'
import { useVisibilityPoll } from '@/hooks/use-visibility-poll'

describe('computePollDelayMs', () => {
  test('polls at the base rate while healthy', () => {
    expect(computePollDelayMs({ baseMs: 10_000, consecutiveFailures: 0, jitterSeed: 0.9 })).toBe(10_000)
  })

  test('doubles per consecutive failure', () => {
    expect(computePollDelayMs({ baseMs: 10_000, consecutiveFailures: 1, jitterSeed: 0 })).toBe(20_000)
    expect(computePollDelayMs({ baseMs: 10_000, consecutiveFailures: 2, jitterSeed: 0 })).toBe(40_000)
  })

  test('never waits longer than the ceiling, jitter included', () => {
    expect(computePollDelayMs({ baseMs: 10_000, consecutiveFailures: 30, jitterSeed: 0.99 })).toBe(MAX_POLL_BACKOFF_MS)
  })

  test('jitter is a pure function of the seed, so the timer is not re-armed forever', () => {
    const input = { baseMs: 5_000, consecutiveFailures: 2, jitterSeed: 0.5 }
    expect(computePollDelayMs(input)).toBe(computePollDelayMs(input))
    expect(computePollDelayMs(input)).toBeGreaterThan(20_000)
  })
})

describe('useVisibilityPoll', () => {
  let isHidden = false

  beforeAll(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden })
  })

  beforeEach(() => {
    jest.useFakeTimers()
    isHidden = false
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function setHidden(hidden: boolean) {
    isHidden = hidden
    document.dispatchEvent(new Event('visibilitychange'))
  }

  async function advance(ms: number) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms)
    })
  }

  test('polls on the base interval while visible', async () => {
    const poll = jest.fn(async () => true)
    renderHook(() => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true }))

    await advance(3000)

    expect(poll).toHaveBeenCalledTimes(3)
  })

  test('does not poll while the page is hidden', async () => {
    const poll = jest.fn(async () => true)
    renderHook(() => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true }))

    await act(async () => setHidden(true))
    await advance(10_000)

    expect(poll).not.toHaveBeenCalled()
  })

  test('refreshes immediately when the page becomes visible, then resumes the interval', async () => {
    const poll = jest.fn(async () => true)
    renderHook(() => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true }))
    await act(async () => setHidden(true))
    await advance(5000)

    await act(async () => setHidden(false))
    await advance(0)
    expect(poll).toHaveBeenCalledTimes(1)

    await advance(1000)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  test('backs off after a failure and recovers after a success', async () => {
    const results = [false, false, true, true]
    const poll = jest.fn(async () => results.shift() ?? true)
    renderHook(() => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true, jitterSeed: 0 }))

    await advance(1000) // 1st poll fails -> next in 2000
    expect(poll).toHaveBeenCalledTimes(1)
    await advance(1999)
    expect(poll).toHaveBeenCalledTimes(1)
    await advance(1) // 2nd poll fails -> next in 4000
    expect(poll).toHaveBeenCalledTimes(2)
    await advance(4000) // 3rd poll succeeds -> back to 1000
    expect(poll).toHaveBeenCalledTimes(3)
    await advance(1000)
    expect(poll).toHaveBeenCalledTimes(4)
  })

  test('treats a thrown poll as a failure', async () => {
    const poll = jest.fn(async () => { throw new Error('offline') })
    renderHook(() => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true, jitterSeed: 0 }))

    await advance(1000)
    await advance(1999)

    expect(poll).toHaveBeenCalledTimes(1)
  })

  test('stops when disabled and on unmount', async () => {
    const poll = jest.fn(async () => true)
    const { rerender, unmount } = renderHook(
      ({ isEnabled }) => useVisibilityPoll(poll, { baseMs: 1000, isEnabled }),
      { initialProps: { isEnabled: true } }
    )
    rerender({ isEnabled: false })
    await advance(5000)
    expect(poll).not.toHaveBeenCalled()

    rerender({ isEnabled: true })
    unmount()
    await advance(5000)
    expect(poll).not.toHaveBeenCalled()
  })

  test('always calls the latest poll callback', async () => {
    const first = jest.fn(async () => true)
    const second = jest.fn(async () => true)
    const { rerender } = renderHook(
      ({ poll }) => useVisibilityPoll(poll, { baseMs: 1000, isEnabled: true }),
      { initialProps: { poll: first } }
    )
    rerender({ poll: second })

    await advance(1000)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
