import { act, renderHook } from '@testing-library/react-native'
import { useDebouncedValue } from './use-debounced-value'

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('settles only once the key has been still for the delay', async () => {
    const { result, rerender } = await renderHook(({ text }: { text: string }) => useDebouncedValue(text, text, 300), { initialProps: { text: 'sm' } })
    expect(result.current).toEqual({ value: 'sm', key: 'sm', isSettled: true })

    await rerender({ text: 'sm a' })
    await act(async () => jest.advanceTimersByTime(200))
    await rerender({ text: 'sm au' })
    await act(async () => jest.advanceTimersByTime(200))
    // Typing kept resetting the wait: still the first value.
    expect(result.current).toEqual({ value: 'sm', key: 'sm', isSettled: false })

    await act(async () => jest.advanceTimersByTime(100))
    expect(result.current).toEqual({ value: 'sm au', key: 'sm au', isSettled: true })
  })
})
