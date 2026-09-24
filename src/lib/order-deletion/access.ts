/**
 * Who may delete a store's orders, and the checks around the final click.
 *
 * Only the store's own owner. Staff with every grant, a branch admin and a
 * superadmin are all refused: deleting history is the owner's decision, and a
 * support account acting for a merchant is exactly the case the export and the
 * recovery window exist to protect against. The database functions repeat this
 * check, so a bug here cannot widen it.
 */
import { MAX_PASSWORD_FAILURES } from './constants'

export interface OwnerCandidate {
  role: string | null
  tenant_id: string | null
  is_owner: boolean | null
}

export type OwnerAccess =
  | { allowed: true }
  | { allowed: false; reason: 'no_account' | 'not_owner' | 'wrong_store' }

export function decideOwnerAccess(appUser: OwnerCandidate | null, tenantId: string): OwnerAccess {
  if (!appUser) return { allowed: false, reason: 'no_account' }
  if (appUser.role !== 'admin' || appUser.is_owner !== true) {
    return { allowed: false, reason: 'not_owner' }
  }
  if (!tenantId || appUser.tenant_id !== tenantId) return { allowed: false, reason: 'wrong_store' }
  return { allowed: true }
}

function normalizePhrase(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The owner typed the store's name: case and spacing forgiven, nothing else. */
export function matchesConfirmationPhrase(typed: string, storeName: string): boolean {
  const expected = normalizePhrase(storeName)
  return expected.length > 0 && normalizePhrase(typed) === expected
}

export function isPasswordAttemptAllowed(recentFailures: number): boolean {
  return recentFailures < MAX_PASSWORD_FAILURES
}

/**
 * A cookie-authenticated request must come from a page on the same host.
 * The session cookie is sent automatically, so without this a page elsewhere
 * could submit on the owner's behalf. Bearer-token callers (the merchant app)
 * are not checked: a token is never attached by the browser on its own.
 *
 * Only headers page script cannot set are trusted: `Host`, `Origin` and
 * `Sec-Fetch-Site` are forbidden request headers. `X-Forwarded-Host` is NOT —
 * a cross-site fetch may send any value it likes — so it is ignored.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const fetchSite = headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite !== 'same-origin') return false

  const origin = headers.get('origin')
  const host = headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
