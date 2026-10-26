import { act, renderHook } from '@testing-library/react'

jest.mock('@/app/actions/store-pin', () => ({ checkStorePinAddressAction: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

describe('useStorePinCheck', () => {
  it('stops the first save on a mismatch, and a second save on the same pin goes ahead', async () => {
    const { checkStorePinAddressAction } = await import('@/app/actions/store-pin')
    jest.mocked(checkStorePinAddressAction).mockResolvedValue({ mismatchKm: 550 })
    const { useStorePinCheck } = await import('@/components/admin/store-pin-check')
    const { result } = renderHook(() => useStorePinCheck('t1'))

    let first = true
    await act(async () => {
      first = await result.current.ensurePinMatchesAddress('Main St', 14.6, 121)
    })
    expect(first).toBe(false)
    expect(result.current.mismatchKm).toBe(550)

    let second = false
    await act(async () => {
      second = await result.current.ensurePinMatchesAddress('Main St', 14.6, 121)
    })
    expect(second).toBe(true)
    expect(result.current.mismatchKm).toBeNull()
    expect(checkStorePinAddressAction).toHaveBeenCalledTimes(1)
  })

  it('asks again once the pin moves, and lets a save without a pin through untouched', async () => {
    const { checkStorePinAddressAction } = await import('@/app/actions/store-pin')
    jest.mocked(checkStorePinAddressAction).mockResolvedValue({ mismatchKm: 550 })
    const { useStorePinCheck } = await import('@/components/admin/store-pin-check')
    const { result } = renderHook(() => useStorePinCheck('t1'))

    await act(async () => {
      await result.current.ensurePinMatchesAddress('Main St', 14.6, 121)
    })
    let moved = true
    await act(async () => {
      moved = await result.current.ensurePinMatchesAddress('Main St', 14.7, 121)
    })
    expect(moved).toBe(false)

    let noPin = false
    await act(async () => {
      noPin = await result.current.ensurePinMatchesAddress('Main St', null, null)
    })
    expect(noPin).toBe(true)
    expect(checkStorePinAddressAction).toHaveBeenCalledTimes(2)
  })
})
