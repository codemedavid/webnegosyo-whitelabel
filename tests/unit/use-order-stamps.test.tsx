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
