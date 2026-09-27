import { act, renderHook, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { useLoyaltyProgress } from '@/hooks/use-loyalty-progress'

const offer = { programName: 'Coffee Club', earnMode: 'stamp' as const, threshold: 8, rewardLabel: '₱100 off', minSpend: null }
const card = { earnedOnOrder: false, programName: 'Coffee Club', earnMode: 'stamp' as const, balance: 5, threshold: 8, rewardsAvailable: 0, rewardLabel: '₱100 off' }

const ok = (body: unknown) => ({ ok: true, json: async () => body })

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

it('never commits the previous customer card under a different phone, tenant, or branch', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue(ok({ success: true, offer, card }))
  const observed: Array<number | null> = []
  const initialProps = { tenantId: 'tenant-1', phone: '+639171234567', outletId: 'branch-1' }
  const { rerender } = renderHook((props: typeof initialProps) => {
    const state = useLoyaltyProgress(props)
    useLayoutEffect(() => { observed.push(state.card?.balance ?? null) })
    return state
  }, { initialProps })
  for (const props of [
    { ...initialProps, phone: '+639181234567' },
    { ...initialProps, tenantId: 'tenant-2' },
    { ...initialProps, outletId: 'branch-2' },
  ]) {
    await act(async () => { jest.advanceTimersByTime(600) })
    observed.length = 0
    rerender(props)
    expect(observed).not.toContain(5)
  }
})

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

it('refreshes on focus and reconnect, keeping confirmed progress after a refresh failure', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValueOnce(ok({ offer, card }))
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue(ok({ offer, card: { ...card, balance: 6 } }))
  const { result } = renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: '+639171234567' }))
  await act(async () => { jest.advanceTimersByTime(600) })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(result.current.card?.balance).toBe(5)
  expect(result.current.error).toMatch(/refresh/i)
  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(result.current.card?.balance).toBe(6)
  expect(result.current.error).toBeNull()
})

it('ignores a late response from a previous number', async () => {
  jest.useFakeTimers()
  let resolveOld!: (value: unknown) => void
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    .mockResolvedValue(ok({ offer, card: { ...card, balance: 1 } }))
  const { result, rerender } = renderHook(({ phone }) => useLoyaltyProgress({ tenantId: 'tenant-1', phone }), { initialProps: { phone: '+639171234567' } })
  await act(async () => { jest.advanceTimersByTime(600) })
  rerender({ phone: '+639181234567' })
  await act(async () => { jest.advanceTimersByTime(600) })
  expect(result.current.card?.balance).toBe(1)
  await act(async () => { resolveOld(ok({ offer, card })) })
  expect(result.current.card?.balance).toBe(1)
})

it('bounds polling, resumes when focused, and cleans up on unmount', async () => {
  jest.useFakeTimers()
  global.fetch = jest.fn().mockResolvedValue(ok({ offer, card }))
  const { unmount } = renderHook(() => useLoyaltyProgress({ tenantId: 'tenant-1', phone: '+639171234567' }))
  await act(async () => { jest.advanceTimersByTime(500) })
  for (let tick = 0; tick < 15; tick++) await act(async () => { jest.advanceTimersByTime(30000) })
  expect(fetch).toHaveBeenCalledTimes(12)
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(fetch).toHaveBeenCalledTimes(13)
  unmount()
  await act(async () => { jest.advanceTimersByTime(60000); window.dispatchEvent(new Event('online')) })
  expect(fetch).toHaveBeenCalledTimes(13)
})
