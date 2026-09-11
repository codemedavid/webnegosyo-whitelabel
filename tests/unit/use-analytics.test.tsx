/**
 * The storefront analytics buffer.
 *
 * Events are collected client-side and flushed to the tenant's Convex
 * deployment on a timer. The flush used to `await` each mutation in turn, so a
 * customer who browsed ten items paid ten sequential round-trips inside one
 * flush — and a single slow or hanging mutation stalled every event behind it.
 * Analytics must never be able to do that.
 */

import { act, renderHook } from '@testing-library/react'

const mutate = jest.fn()

jest.mock('convex/react', () => ({
  __esModule: true,
  useMutation: () => mutate,
}))

// next/jest leaves static imports ahead of jest.mock, so the hook is imported
// lazily inside the tests.
const loadHook = async () => (await import('@/hooks/use-analytics')).useAnalytics

describe('useAnalytics', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mutate.mockReset()
    mutate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('sends every buffered event', async () => {
    const useAnalytics = await loadHook()
    const { result } = renderHook(() => useAnalytics())

    act(() => {
      result.current.trackEvent('upsell_shown', { source: 'inline_upgrade' })
      result.current.trackEvent('upsell_clicked')
    })
    await act(async () => {
      jest.advanceTimersByTime(5000)
    })

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[0][0]).toMatchObject({
      type: 'upsell_shown',
      metadata: { source: 'inline_upgrade' },
    })
  })

  it('does not wait for one event before sending the next', async () => {
    // Arrange — the first mutation never settles, the shape of a stalled
    // request. Every other event must still go out.
    const useAnalytics = await loadHook()
    mutate.mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useAnalytics())

    // Act
    act(() => {
      result.current.trackEvent('first')
      result.current.trackEvent('second')
      result.current.trackEvent('third')
    })
    await act(async () => {
      jest.advanceTimersByTime(5000)
    })

    // Assert
    expect(mutate).toHaveBeenCalledTimes(3)
  })

  it('survives a rejected mutation without losing the rest of the batch', async () => {
    const useAnalytics = await loadHook()
    mutate.mockRejectedValueOnce(new Error('convex unreachable'))
    const { result } = renderHook(() => useAnalytics())

    act(() => {
      result.current.trackEvent('first')
      result.current.trackEvent('second')
    })
    await act(async () => {
      jest.advanceTimersByTime(5000)
    })

    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it('sends nothing when nothing was tracked', async () => {
    const useAnalytics = await loadHook()
    renderHook(() => useAnalytics())

    await act(async () => {
      jest.advanceTimersByTime(15000)
    })

    expect(mutate).not.toHaveBeenCalled()
  })

  it('takes each event exactly once, however many flushes run', async () => {
    const useAnalytics = await loadHook()
    const { result } = renderHook(() => useAnalytics())

    act(() => {
      result.current.trackEvent('only-once')
    })
    await act(async () => {
      jest.advanceTimersByTime(5000)
      jest.advanceTimersByTime(5000)
    })

    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('flushes what is still buffered when the page unmounts', async () => {
    const useAnalytics = await loadHook()
    const { result, unmount } = renderHook(() => useAnalytics())

    act(() => {
      result.current.trackEvent('last-gasp')
    })
    await act(async () => {
      unmount()
    })

    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
