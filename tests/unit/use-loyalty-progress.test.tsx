import { act, renderHook, waitFor } from '@testing-library/react'
import { useLoyaltyProgress } from '@/hooks/use-loyalty-progress'

const offer = { programName: 'Coffee Club', earnMode: 'stamp' as const, threshold: 8, rewardLabel: '₱100 off', minSpend: null }
const card = { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp' as const, balance: 5, threshold: 8, rewardsAvailable: 0, rewardLabel: '₱100 off' }

const ok = (body: unknown) => ({ ok: true, json: async () => body })

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

it('asks nothing until a complete number is in the field', () => {
  global.fetch = jest.fn()
  const { result } = renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: null }))
  expect(result.current.card).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('reads the card once typing has settled, not on every keystroke', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue(ok({ success: true, offer, card }))
  const { result, rerender } = renderHook(
    ({ phone }: { phone: string | null }) => useLoyaltyProgress({ tenantId: 'tenant-1', phone }),
    { initialProps: { phone: '+639171234500' as string | null } },
  )
  rerender({ phone: '+639171234567' })
  await act(async () => { jest.advanceTimersByTime(200) })
  expect(fetch).not.toHaveBeenCalled()

  await act(async () => { jest.advanceTimersByTime(500) })
  await waitFor(() => expect(result.current.card?.balance).toBe(5))
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(result.current.offer).toEqual(offer)
})

it('drops the previous number\'s card the moment the field changes', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue(ok({ success: true, offer, card }))
  const { result, rerender } = renderHook(
    ({ phone }: { phone: string | null }) => useLoyaltyProgress({ tenantId: 'tenant-1', phone }),
    { initialProps: { phone: '+639171234567' as string | null } },
  )
  await act(async () => { jest.advanceTimersByTime(600) })
  await waitFor(() => expect(result.current.card?.balance).toBe(5))

  rerender({ phone: null })
  expect(result.current.card).toBeNull()
})

it('sends the number in the body, never in the URL', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue(ok({ success: true, offer, card }))
  renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: '+639171234567', outletId: 'outlet-a' }))
  await act(async () => { jest.advanceTimersByTime(600) })

  const [url, init] = jest.mocked(fetch).mock.calls[0] as [string, RequestInit]
  expect(url).toBe('/api/loyalty/progress')
  expect(url).not.toContain('9171234567')
  expect(JSON.parse(String(init.body))).toEqual({ tenantId: 'tenant-1', phone: '+639171234567', outletId: 'outlet-a' })
})

it('stays quiet when the store cannot answer', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'unavailable' }) })
  const { result } = renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: '+639171234567' }))
  await act(async () => { jest.advanceTimersByTime(600) })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.card).toBeNull()
  expect(result.current.offer).toBeNull()
})

it('does not fetch at all when the surface is switched off', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn()
  renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: '+639171234567', enabled: false }))
  await act(async () => { jest.advanceTimersByTime(600) })
  expect(fetch).not.toHaveBeenCalled()
})
