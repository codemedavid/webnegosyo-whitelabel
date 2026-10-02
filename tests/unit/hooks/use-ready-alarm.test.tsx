/**
 * The ready alarm on the tracking page. It failed silently because the audio
 * context was first created inside a poll callback — outside any user gesture
 * — so mobile browsers kept it suspended, and the "ring" was one half-second
 * chime. The alarm now unlocks audio inside the opt-in tap and rings, buzzes
 * and notifies until the customer acknowledges it.
 */
import { act, renderHook } from '@testing-library/react'

const audio = { unlock: jest.fn(), playTones: jest.fn(), close: jest.fn() }
const wakeLock = { release: jest.fn(async () => undefined), released: false }

jest.mock('@/lib/ready-alarm-browser', () => ({
  createAlarmAudio: jest.fn(() => audio),
  requestScreenWakeLock: jest.fn(async () => wakeLock),
  registerAlertServiceWorker: jest.fn(async () => undefined),
  showReadyNotification: jest.fn(async () => undefined),
  vibrate: jest.fn(),
}))

jest.mock('@/lib/notification-utils', () => ({
  requestNotificationPermission: jest.fn(async () => 'granted'),
}))

// next/jest leaves static imports ahead of jest.mock, so load lazily.
function load() {
  const browser = jest.requireMock('@/lib/ready-alarm-browser') as Record<string, jest.Mock>
  const alert = jest.requireActual('@/lib/order-ready-alert') as typeof import('@/lib/order-ready-alert')
  const { useReadyAlarm } = jest.requireActual('@/hooks/use-ready-alarm') as typeof import('@/hooks/use-ready-alarm')
  return { browser, alert, useReadyAlarm }
}

const NOTICE = {
  title: 'Your order is ready!',
  body: 'Order #07 from Kape is ready for pickup.',
  url: 'https://kape.example.com/order/abc',
  tag: 'order-ready-abc',
  icon: null,
}

describe('useReadyAlarm', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    audio.unlock.mockResolvedValue(true)
    wakeLock.released = false
    document.title = 'Track order'
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('arming unlocks audio inside the tap, previews the ring and keeps the screen awake', async () => {
    const { browser, alert, useReadyAlarm } = load()
    const { result } = renderHook(() => useReadyAlarm())

    await act(async () => {
      await result.current.arm()
    })

    expect(result.current.isArmed).toBe(true)
    expect(audio.unlock).toHaveBeenCalledTimes(1)
    expect(audio.playTones).toHaveBeenCalledWith(alert.READY_PREVIEW_TONES)
    expect(browser.vibrate).toHaveBeenCalled()
    expect(browser.requestScreenWakeLock).toHaveBeenCalledTimes(1)
    expect(browser.registerAlertServiceWorker).toHaveBeenCalledTimes(1)
  })

  test('audio is unlocked before the notification prompt can swallow the gesture', async () => {
    const { useReadyAlarm } = load()
    const permission = jest.requireMock('@/lib/notification-utils').requestNotificationPermission as jest.Mock
    const { result } = renderHook(() => useReadyAlarm())

    await act(async () => {
      await result.current.arm()
    })

    expect(audio.unlock.mock.invocationCallOrder[0]).toBeLessThan(permission.mock.invocationCallOrder[0])
  })

  test('rings, buzzes and notifies, then repeats until stopped', async () => {
    const { browser, alert, useReadyAlarm } = load()
    const { result } = renderHook(() => useReadyAlarm())
    await act(async () => {
      await result.current.arm()
    })
    audio.playTones.mockClear()
    browser.vibrate.mockClear()

    act(() => result.current.ring(NOTICE))

    expect(result.current.isRinging).toBe(true)
    expect(audio.playTones).toHaveBeenCalledWith(alert.READY_RING_TONES)
    expect(browser.vibrate).toHaveBeenCalledWith(alert.READY_VIBRATION_PATTERN)
    expect(browser.showReadyNotification).toHaveBeenCalledWith(NOTICE)
    expect(document.title).toContain('Your order is ready!')

    await act(async () => {
      await jest.advanceTimersByTimeAsync(alert.READY_RING_REPEAT_MS * 2)
    })
    expect(audio.playTones).toHaveBeenCalledTimes(3)

    act(() => result.current.stop())
    expect(result.current.isRinging).toBe(false)
    expect(browser.vibrate).toHaveBeenLastCalledWith(0)
    expect(wakeLock.release).toHaveBeenCalled()
    expect(document.title).toBe('Track order')

    await act(async () => {
      await jest.advanceTimersByTimeAsync(alert.READY_RING_REPEAT_MS * 3)
    })
    expect(audio.playTones).toHaveBeenCalledTimes(3)
  })

  test('a second ring while ringing does not stack a second alarm', async () => {
    const { browser, useReadyAlarm } = load()
    const { result } = renderHook(() => useReadyAlarm())
    await act(async () => {
      await result.current.arm()
    })

    act(() => result.current.ring(NOTICE))
    act(() => result.current.ring(NOTICE))

    expect(browser.showReadyNotification).toHaveBeenCalledTimes(1)
  })

  test('gives up ringing after the cap so a forgotten phone does not ring forever', async () => {
    const { alert, useReadyAlarm } = load()
    const { result } = renderHook(() => useReadyAlarm())
    await act(async () => {
      await result.current.arm()
    })

    act(() => result.current.ring(NOTICE))
    await act(async () => {
      await jest.advanceTimersByTimeAsync(alert.READY_RING_MAX_MS)
    })

    expect(result.current.isRinging).toBe(false)
    const callsAtCap = audio.playTones.mock.calls.length
    await act(async () => {
      await jest.advanceTimersByTimeAsync(alert.READY_RING_REPEAT_MS * 3)
    })
    expect(audio.playTones).toHaveBeenCalledTimes(callsAtCap)
  })

  test('re-takes the screen wake lock when the page is shown again', async () => {
    const { browser, useReadyAlarm } = load()
    const { result } = renderHook(() => useReadyAlarm())
    await act(async () => {
      await result.current.arm()
    })
    wakeLock.released = true // the browser drops it whenever the page is hidden

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(browser.requestScreenWakeLock).toHaveBeenCalledTimes(2)
  })

  test('unmounting silences everything', async () => {
    const { alert, useReadyAlarm } = load()
    const { result, unmount } = renderHook(() => useReadyAlarm())
    await act(async () => {
      await result.current.arm()
    })
    act(() => result.current.ring(NOTICE))
    const calls = audio.playTones.mock.calls.length

    unmount()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(alert.READY_RING_REPEAT_MS * 3)
    })

    expect(audio.playTones).toHaveBeenCalledTimes(calls)
    expect(audio.close).toHaveBeenCalled()
  })
})
