export type MetaEventName =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'Lead'

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[][]
  loaded?: boolean
  version?: string
  push?: (...args: unknown[]) => void
}

declare global {
  interface Window {
    fbq?: MetaPixelFunction
    _fbq?: Window['fbq']
  }
}

const META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js'

function injectMetaPixelScript() {
  if (document.querySelector(`script[src="${META_PIXEL_SCRIPT_SRC}"]`)) return

  const script = document.createElement('script')
  script.async = true
  script.src = META_PIXEL_SCRIPT_SRC
  document.head.appendChild(script)
}

function installMetaPixelStub() {
  if (window.fbq) return

  const fbq: MetaPixelFunction = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args)
      return
    }

    fbq.queue = fbq.queue || []
    fbq.queue.push(args)
  }

  fbq.queue = []
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.push = (...args: unknown[]) => {
    fbq(...args)
  }

  window.fbq = fbq
  window._fbq = fbq
}

export function initMetaPixel(pixelId: string) {
  if (typeof window === 'undefined' || !pixelId) return

  if (!window.fbq) {
    installMetaPixelStub()
    injectMetaPixelScript()
  }

  window.fbq?.('init', pixelId)
  window.fbq?.('track', 'PageView')
}

export function trackMetaEvent(
  eventName: MetaEventName,
  parameters: Record<string, unknown> = {},
  eventId?: string
) {
  if (typeof window === 'undefined' || !window.fbq) return

  if (eventId) {
    window.fbq('track', eventName, parameters, { eventID: eventId })
    return
  }

  window.fbq('track', eventName, parameters)
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))

  return match?.split('=').slice(1).join('=')
}

export function getMetaBrowserData() {
  if (typeof window === 'undefined') {
    return {}
  }

  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    eventSourceUrl: window.location.href,
    clientUserAgent: window.navigator.userAgent,
  }
}

export function createMetaEventId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
