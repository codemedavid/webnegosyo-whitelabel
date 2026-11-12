import type { AppErrorCode } from '@/lib/contract'

/**
 * One `Idempotency-Key` per checkout attempt. Retrying the same bag reuses it,
 * so a placed-but-unanswered order is found again instead of placed twice; a
 * changed bag or a finished attempt gets a fresh one.
 */
export interface CheckoutAttempt {
  key: string
  /** `draftFingerprint` of what the key was first sent with. */
  fingerprint: string
}

const KEY_PATTERN = /^[\x21-\x7e]{8,100}$/

/** 8–100 printable ASCII characters, as the order route accepts. */
export function isValidIdempotencyKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

/** The attempt to send now: the held one if nothing that would be sent changed, else a new key. */
export function attemptFor(current: CheckoutAttempt | null, fingerprint: string, mintKey: () => string): CheckoutAttempt {
  if (current && current.fingerprint === fingerprint && isValidIdempotencyKey(current.key)) return current
  return { key: mintKey(), fingerprint }
}

/**
 * After a failed send. `refused` means the store said no and nothing was
 * placed, so the next try is a new attempt. Anything else (still placing,
 * lost answer, outage) may have placed the order: keep the key so a retry
 * returns that order rather than a second one.
 */
export function attemptAfterFailure(attempt: CheckoutAttempt, code: AppErrorCode | null): CheckoutAttempt | null {
  return code === 'refused' ? null : attempt
}

const HEX = '0123456789abcdef'

interface RandomSources {
  getRandomValues?: (bytes: Uint8Array) => Uint8Array
  uuidv4?: () => string
}

/** What this runtime offers without a new native module: Web Crypto if present, else expo-modules-core's native UUID v4. */
function runtimeSources(): RandomSources {
  const scope = globalThis as { crypto?: { getRandomValues?: (bytes: Uint8Array) => Uint8Array }; expo?: { uuidv4?: () => string } }
  const getRandomValues = scope.crypto?.getRandomValues?.bind(scope.crypto)
  const uuidv4 = scope.expo?.uuidv4
  return { getRandomValues, uuidv4: typeof uuidv4 === 'function' ? uuidv4 : undefined }
}

/** A fresh key: `app-` + 32 hex characters from a cryptographic source. */
export function mintIdempotencyKey(sources: RandomSources = runtimeSources()): string {
  if (sources.getRandomValues) {
    const bytes = sources.getRandomValues(new Uint8Array(16))
    return `app-${Array.from(bytes, (byte) => HEX[byte >> 4] + HEX[byte & 15]).join('')}`
  }
  if (sources.uuidv4) return `app-${sources.uuidv4().replace(/-/g, '').toLowerCase()}`
  // Every Expo build installs `expo.uuidv4`; this only runs in a bare JS test runtime.
  // A key only has to be unique per attempt, it is not a secret.
  const fallback = Array.from({ length: 32 }, () => HEX[Math.floor(Math.random() * 16)]).join('')
  return `app-${fallback}`
}
