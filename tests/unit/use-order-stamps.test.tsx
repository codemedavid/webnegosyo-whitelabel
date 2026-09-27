import { act, renderHook, waitFor } from '@testing-library/react'
import { useOrderStamps } from '@/hooks/use-order-stamps'

const input = { orderId: 'order', tenantId: 'tenant', trackingToken: 'token', enabled: true, status: 'pending' }
const initialStamps = {
  claim: { state: 'open' as const }, hasContact: true,
  card: { programName: 'Coffee Club', earnMode: 'stamp' as const, balance: 3, threshold: 8, rewardsAvailable: 0, rewardLabel: 'Free Coffee' },
}

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

it('shows server-loaded progress immediately while the client refresh is pending', () => {
  global.fetch = jest.fn().mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useOrderStamps({ ...input, initialStamps }))
  expect(result.current.stamps).toEqual(initialStamps)
})

it('refreshes progress when earning finishes after the order status has already changed', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, ...initialStamps }) })
    .mockResolvedValue({ ok: true, json: async () => ({ success: true, ...initialStamps, card: { ...initialStamps.card, balance: 4 } }) })
  const { result, unmount } = renderHook(() => useOrderStamps({ ...input, status: 'delivered' }))
  await waitFor(() => expect(result.current.stamps?.card?.balance).toBe(3))
  await act(async () => { jest.advanceTimersByTime(10000) })
  expect(result.current.stamps?.card?.balance).toBe(4)
  unmount()
  const requests = jest.mocked(fetch).mock.calls.length
  await act(async () => { jest.advanceTimersByTime(20000) })
  expect(fetch).toHaveBeenCalledTimes(requests)
})

it('never renders an old order balance after the identity changes or a stale response arrives', async () => {
  let resolveOld!: (value: unknown) => void
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    .mockResolvedValue({ ok: true, json: async () => ({ success: true, ...initialStamps, card: { ...initialStamps.card, balance: 1 } }) })
  const { result, rerender } = renderHook((props) => useOrderStamps(props), { initialProps: { ...input, initialStamps } })
  rerender({ ...input, orderId: 'another-order', initialStamps })
  expect(result.current.stamps).toBeNull()
  await waitFor(() => expect(result.current.stamps?.card?.balance).toBe(1))
  await act(async () => { resolveOld({ ok: true, json: async () => ({ success: true, ...initialStamps }) }) })
  expect(result.current.stamps?.card?.balance).toBe(1)
})

it('keeps the confirmed order card on failed focus refresh and recovers on reconnect', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, ...initialStamps }) })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => ({ success: true, ...initialStamps, card: { ...initialStamps.card, balance: 4 } }) })
  const { result } = renderHook(() => useOrderStamps(input))
  await waitFor(() => expect(result.current.stamps?.card?.balance).toBe(3))
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(result.current.stamps?.card?.balance).toBe(3)
  expect(result.current.error).toMatch(/refresh/i)
  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(result.current.stamps?.card?.balance).toBe(4)
  expect(result.current.error).toBeNull()
})

it('bounds polling and allows explicit refresh after polling stops', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, ...initialStamps }) })
  const { result, unmount } = renderHook(() => useOrderStamps(input))
  await act(async () => {})
  for (let tick = 0; tick < 15; tick++) await act(async () => { jest.advanceTimersByTime(10000) })
  expect(fetch).toHaveBeenCalledTimes(12)
  await act(async () => { result.current.refresh() })
  expect(fetch).toHaveBeenCalledTimes(13)
  unmount()
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(fetch).toHaveBeenCalledTimes(13)
})
