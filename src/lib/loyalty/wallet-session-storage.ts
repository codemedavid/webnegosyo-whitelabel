/**
 * Keeps a verified rewards-page session for the life of the browser tab, so a
 * reload inside its 30 minutes does not text the customer another code.
 *
 * sessionStorage (not localStorage): closing the tab ends it, which suits a
 * shared phone at a counter. Every access is guarded — private windows and
 * blocked storage throw — and a missing session only means "verify again".
 * The server still decides whether a token is valid; this is convenience only.
 */

export interface StoredWalletSession {
  phone: string
  token: string
  expiresAt: string
}

const KEY_PREFIX = 'loyalty-wallet-session:'

function keyFor(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}`
}

function isStoredSession(value: unknown): value is StoredWalletSession {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.phone === 'string' && record.phone.length <= 32 &&
    typeof record.token === 'string' && record.token.length <= 128 &&
    typeof record.expiresAt === 'string'
}

export function readStoredWalletSession(tenantId: string, now: number): StoredWalletSession | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(tenantId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredSession(parsed)) return null
    const expiry = Date.parse(parsed.expiresAt)
    if (!Number.isFinite(expiry) || expiry <= now) {
      window.sessionStorage.removeItem(keyFor(tenantId))
      return null
    }
    return { phone: parsed.phone, token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function storeWalletSession(tenantId: string, session: StoredWalletSession): void {
  try {
    window.sessionStorage.setItem(keyFor(tenantId), JSON.stringify(session))
  } catch {
    // Storage unavailable: the session still works until the page reloads.
  }
}

export function forgetWalletSession(tenantId: string): void {
  try {
    window.sessionStorage.removeItem(keyFor(tenantId))
  } catch {
    // Nothing stored, nothing to forget.
  }
}
