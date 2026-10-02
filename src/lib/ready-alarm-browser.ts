/**
 * Browser plumbing for the tracking page's ready alarm: the ring itself,
 * vibration, the screen wake lock and the system notification. Every call is
 * best-effort — a device without one of them still gets the others.
 */
import { READY_VIBRATION_PATTERN, type ReadyTone } from '@/lib/order-ready-alert'

/** Served from `/api/` so tenant hosts don't rewrite it into a storefront path. */
export const ALERT_SERVICE_WORKER_PATH = '/api/orders/ready-alert-sw'

const MASTER_GAIN = 0.9
const TONE_PEAK_GAIN = 0.7
const TONE_EDGE_S = 0.005

export interface AlarmAudio {
  /** Must run inside the user's tap — browsers only allow audio after one. */
  unlock: () => Promise<boolean>
  playTones: (tones: readonly ReadyTone[]) => void
  close: () => void
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: string }
}

/**
 * iOS mutes Web Audio under the silent switch unless the page declares itself
 * a playback app (Safari 16.4+). A customer who opted into a ring wants it.
 */
function preferPlaybackAudioSession(): void {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession
    if (session) session.type = 'playback'
  } catch {
    // Older browsers have no audio session — the ring still plays unmuted.
  }
}

export function createAlarmAudio(): AlarmAudio {
  let context: AudioContext | null = null

  const getContext = (): AudioContext | null => {
    if (context) return context
    const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!AudioContextCtor) return null
    context = new AudioContextCtor()
    return context
  }

  const unlock = async (): Promise<boolean> => {
    preferPlaybackAudioSession()
    const ctx = getContext()
    if (!ctx) return false
    try {
      // Both calls happen synchronously inside the tap; iOS only unlocks once
      // a sound has actually started there, so play one silent sample.
      const resuming = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
      const silence = ctx.createBufferSource()
      silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      silence.connect(ctx.destination)
      silence.start(0)
      await resuming
      return ctx.state === 'running'
    } catch {
      return false
    }
  }

  const playTones = (tones: readonly ReadyTone[]): void => {
    const ctx = getContext()
    if (!ctx) return
    try {
      // A phone that slept may have suspended the context; resuming outside a
      // tap works on Android and is refused harmlessly elsewhere.
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)

      const master = ctx.createGain()
      master.gain.value = MASTER_GAIN
      const limiter = ctx.createDynamicsCompressor()
      master.connect(limiter)
      limiter.connect(ctx.destination)

      const now = ctx.currentTime
      for (const tone of tones) {
        const start = now + tone.startS
        const end = start + tone.durationS
        const oscillator = ctx.createOscillator()
        const envelope = ctx.createGain()
        // Square carries far better than sine through a small phone speaker.
        oscillator.type = 'square'
        oscillator.frequency.setValueAtTime(tone.frequencyHz, start)
        envelope.gain.setValueAtTime(0, start)
        envelope.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, start + TONE_EDGE_S)
        envelope.gain.setValueAtTime(TONE_PEAK_GAIN, end - TONE_EDGE_S)
        envelope.gain.linearRampToValueAtTime(0, end)
        oscillator.connect(envelope)
        envelope.connect(master)
        oscillator.start(start)
        oscillator.stop(end)
      }
    } catch {
      // Audio unavailable — vibration and the notification still fire.
    }
  }

  const close = (): void => {
    const ctx = context
    context = null
    if (ctx) void ctx.close().catch(() => undefined)
  }

  return { unlock, playTones, close }
}

/** `0` (or `[]`) cancels a running pattern. iOS Safari has no vibration API. */
export function vibrate(pattern: number | readonly number[]): void {
  try {
    navigator.vibrate?.(typeof pattern === 'number' ? pattern : [...pattern])
  } catch {
    // Not every device vibrates.
  }
}

/**
 * Keep the screen on while the customer waits: a page left open on the table
 * stays alive to hear the kitchen. Browsers drop the lock whenever the page
 * is hidden, so callers re-request it on return.
 */
export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (!('wakeLock' in navigator)) return null
    return await navigator.wakeLock.request('screen')
  } catch {
    // Refused (battery saver, unsupported, not visible) — the alarm still works.
    return null
  }
}

/**
 * Android Chrome refuses `new Notification()` outright; only a service worker
 * registration can show one there. This worker controls no storefront page —
 * its scope is `/api/orders/` — it exists to show and focus notifications.
 */
export async function registerAlertServiceWorker(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    await navigator.serviceWorker.register(ALERT_SERVICE_WORKER_PATH)
  } catch {
    // Falls back to the page-level Notification constructor.
  }
}

export interface ReadyNotificationInput {
  title: string
  body: string
  /** The tracking page — tapping the notification brings it back. */
  url: string
  /** One notification per order, replaced rather than stacked. */
  tag: string
  icon: string | null
}

interface AlarmNotificationOptions extends NotificationOptions {
  vibrate?: number[]
  renotify?: boolean
}

export async function showReadyNotification(input: ReadyNotificationInput): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const options: AlarmNotificationOptions = {
    body: input.body,
    tag: input.tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [...READY_VIBRATION_PATTERN],
    data: { url: input.url },
    ...(input.icon ? { icon: input.icon } : {}),
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration(ALERT_SERVICE_WORKER_PATH)
    if (registration) {
      await registration.showNotification(input.title, options)
      return
    }
  } catch {
    // Fall through to the page-level constructor.
  }

  try {
    const notification = new Notification(input.title, options)
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Unsupported here (iOS outside a home-screen app) — the in-page alarm rang.
  }
}
