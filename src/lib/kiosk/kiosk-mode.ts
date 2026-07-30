/**
 * Kiosk mode — a storefront that serves a queue instead of a person.
 *
 * A merchant points a counter tablet at `?kiosk=1` and the storefront stops
 * behaving like a phone: no Messenger handoff (there is no customer account to
 * hand off to), and after an order it takes itself back to the menu so the next
 * customer finds a clean screen rather than a stranger's receipt.
 *
 * The decision lives here, pure, because the awkward parts are all decisions:
 * a tablet that must be taken *out* of kiosk mode without devtools, and a mode
 * that has to survive the in-app `router.push` calls that drop the query string.
 * Reading the URL and navigating belong to the hook — see use-kiosk-mode.ts.
 */

/** The query parameter a merchant puts on the tablet's home screen link. */
export const KIOSK_PARAM = 'kiosk'

export const KIOSK_STORAGE_KEY_PREFIX = 'kiosk_mode_'

/** Long enough to read "Order placed", short enough to keep a queue moving. */
export const KIOSK_RETURN_DELAY_MS = 3000

/** The `Storage` surface this module uses; injectable so tests need no DOM. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const storageKey = (tenantSlug: string): string => `${KIOSK_STORAGE_KEY_PREFIX}${tenantSlug}`

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off'])

/**
 * What the URL says about kiosk mode: on, explicitly off, or nothing at all.
 *
 * `null` is a real answer and not a failure — most pages in the flow are
 * reached without the param, and those must not knock a tablet out of kiosk
 * mode. An unrecognised value is treated the same way, for the same reason.
 */
export function parseKioskParam(value: string | null | undefined): boolean | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (normalized === '') return null
  if (TRUTHY.has(normalized)) return true
  if (FALSY.has(normalized)) return false
  return null
}

export interface KioskModeInput {
  /** The raw `?kiosk=` value, or null when the page was reached without it. */
  urlValue: string | null
  /** Whether this tenant's storefront is already flagged as a kiosk here. */
  stored: boolean
}

export interface KioskModeResult {
  isKiosk: boolean
  /** The flag should be written so the mode survives in-app navigation. */
  shouldPersist: boolean
  /** The flag should be removed — the URL took this device out of kiosk mode. */
  shouldClearStorage: boolean
}

/**
 * The URL wins over storage, exactly as `?outlet=` does, so a merchant can put
 * a device into or out of kiosk mode with a link and nothing else.
 */
export function resolveKioskMode({ urlValue, stored }: KioskModeInput): KioskModeResult {
  const fromUrl = parseKioskParam(urlValue)

  if (fromUrl === true) {
    return { isKiosk: true, shouldPersist: !stored, shouldClearStorage: false }
  }

  if (fromUrl === false) {
    return { isKiosk: false, shouldPersist: false, shouldClearStorage: stored }
  }

  // The URL says nothing: the cart and checkout are reached by router.push,
  // which drops the query string. Storage is what carries the mode there.
  return { isKiosk: stored, shouldPersist: false, shouldClearStorage: false }
}

/**
 * Storage access is wrapped throughout because Safari's private mode throws on
 * it, and a storefront must not break over where we cached a preference.
 */
export function readKioskMode(storage: StorageLike, tenantSlug: string): boolean {
  try {
    return storage.getItem(storageKey(tenantSlug)) === '1'
  } catch {
    return false
  }
}

export function writeKioskMode(storage: StorageLike, tenantSlug: string): void {
  try {
    storage.setItem(storageKey(tenantSlug), '1')
  } catch {
    // A tablet that cannot persist the flag still works while the param is on
    // the URL. That is a worse kiosk, not a broken one.
  }
}

export function clearKioskMode(storage: StorageLike, tenantSlug: string): void {
  try {
    storage.removeItem(storageKey(tenantSlug))
  } catch {
    // See writeKioskMode.
  }
}

/** Where a kiosk sends itself after an order: the menu, still in kiosk mode. */
export function kioskReturnPath(tenantSlug: string): string {
  return `/${tenantSlug}/menu?${KIOSK_PARAM}=1`
}
