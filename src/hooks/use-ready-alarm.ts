'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PREVIEW_VIBRATION_MS,
  READY_PREVIEW_TONES,
  READY_RING_MAX_MS,
  READY_RING_REPEAT_MS,
  READY_RING_TONES,
  READY_VIBRATION_PATTERN,
} from '@/lib/order-ready-alert'
import {
  createAlarmAudio,
  registerAlertServiceWorker,
  requestScreenWakeLock,
  showReadyNotification,
  vibrate,
  type AlarmAudio,
  type ReadyNotificationInput,
} from '@/lib/ready-alarm-browser'
import { requestNotificationPermission } from '@/lib/notification-utils'

export interface ReadyAlarm {
  isArmed: boolean
  isRinging: boolean
  /** Call from the customer's tap: audio can only be unlocked inside one. */
  arm: () => Promise<void>
  /** Ring, buzz and notify in repeating bursts until `stop` or the cap. */
  ring: (notice: ReadyNotificationInput) => void
  /** Silence the alarm and let the screen sleep again. */
  stop: () => void
}

/**
 * The tracking page's "ring me when it's ready" alarm.
 *
 * The old ring created its audio context inside a poll callback — outside any
 * gesture — so mobile browsers kept it suspended and nothing played. Arming
 * now unlocks audio in the tap (and previews the sound, so the customer knows
 * it works), keeps the screen awake while they wait, and the ring repeats
 * until they acknowledge it.
 */
export function useReadyAlarm(): ReadyAlarm {
  const [isArmed, setIsArmed] = useState(false)
  const [isRinging, setIsRinging] = useState(false)
  const audioRef = useRef<AlarmAudio | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const isRingingRef = useRef(false)
  const isDoneRef = useRef(false)
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originalTitleRef = useRef<string | null>(null)

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current
    wakeLockRef.current = null
    if (lock) void lock.release().catch(() => undefined)
  }, [])

  const silence = useCallback(() => {
    if (repeatTimerRef.current) clearInterval(repeatTimerRef.current)
    if (capTimerRef.current) clearTimeout(capTimerRef.current)
    repeatTimerRef.current = null
    capTimerRef.current = null
    if (isRingingRef.current) vibrate(0)
    isRingingRef.current = false
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current
      originalTitleRef.current = null
    }
    setIsRinging(false)
  }, [])

  const stop = useCallback(() => {
    isDoneRef.current = true
    silence()
    releaseWakeLock()
  }, [silence, releaseWakeLock])

  const arm = useCallback(async () => {
    const audio = audioRef.current ?? createAlarmAudio()
    audioRef.current = audio
    isDoneRef.current = false
    // Everything that needs the gesture starts before the first await: audio
    // first (the permission prompt can end the gesture), then the prompt
    // itself (Safari refuses one requested after an await).
    const unlocking = audio.unlock()
    const permissionRequest = requestNotificationPermission().catch(() => 'unsupported' as const)
    audio.playTones(READY_PREVIEW_TONES)
    vibrate(PREVIEW_VIBRATION_MS)
    setIsArmed(true)

    await unlocking
    if (!wakeLockRef.current) wakeLockRef.current = await requestScreenWakeLock()
    // Without permission there is no system notification — the in-page ring
    // and vibration still fire.
    if ((await permissionRequest) === 'granted') await registerAlertServiceWorker()
  }, [])

  const ring = useCallback(
    (notice: ReadyNotificationInput) => {
      if (isRingingRef.current) return
      isRingingRef.current = true
      setIsRinging(true)

      const burst = () => {
        audioRef.current?.playTones(READY_RING_TONES)
        vibrate(READY_VIBRATION_PATTERN)
      }
      burst()
      repeatTimerRef.current = setInterval(burst, READY_RING_REPEAT_MS)
      capTimerRef.current = setTimeout(silence, READY_RING_MAX_MS)

      if (originalTitleRef.current === null) originalTitleRef.current = document.title
      document.title = `🔔 ${notice.title}`
      void showReadyNotification(notice)
    },
    [silence],
  )

  // Browsers drop the wake lock whenever the page is hidden; take it back.
  useEffect(() => {
    if (!isArmed) return
    const handleVisibilityChange = async () => {
      if (document.hidden || isDoneRef.current) return
      if (wakeLockRef.current && !wakeLockRef.current.released) return
      wakeLockRef.current = await requestScreenWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isArmed])

  useEffect(() => {
    return () => {
      stop()
      audioRef.current?.close()
      audioRef.current = null
    }
  }, [stop])

  return { isArmed, isRinging, arm, ring, stop }
}
