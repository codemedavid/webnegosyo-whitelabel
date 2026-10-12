import { act, renderHook } from '@testing-library/react'
import { useOwlBeat } from '@/components/onboarding/use-owl-beat'

describe('useOwlBeat', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('starts at rest', () => {
    const { result } = renderHook(() => useOwlBeat(1000))
    expect(result.current.isReacting).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('reacts for one beat, then rests again', () => {
    const { result } = renderHook(() => useOwlBeat(1000))
    act(() => result.current.react())
    expect(result.current.isReacting).toBe(true)
    act(() => jest.advanceTimersByTime(999))
    expect(result.current.isReacting).toBe(true)
    act(() => jest.advanceTimersByTime(1))
    expect(result.current.isReacting).toBe(false)
  })

  it('restarts the beat on a quick second tap and counts both', () => {
    const { result } = renderHook(() => useOwlBeat(1000))
    act(() => result.current.react())
    act(() => jest.advanceTimersByTime(600))
    act(() => result.current.react())
    act(() => jest.advanceTimersByTime(600))
    expect(result.current.isReacting).toBe(true)
    expect(result.current.count).toBe(2)
    act(() => jest.advanceTimersByTime(400))
    expect(result.current.isReacting).toBe(false)
  })

  it('leaves no timer behind when the screen goes away', () => {
    const { result, unmount } = renderHook(() => useOwlBeat(1000))
    act(() => result.current.react())
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
