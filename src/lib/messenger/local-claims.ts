/**
 * A once-only claim kept in THIS server instance, under the Redis claim
 * (`createOnceClaims` in `dedupe.ts`). Redis fails open — no Redis configured, or Redis down, and
 * every claim is granted — which is right for webhook events (a missed answer
 * is worse than a repeat) but let a staff Send tap that was retried after a
 * timeout reach the customer twice (seen 2026-11-15 on a server without
 * Redis). A retry usually lands on the same warm instance, so this catches
 * it there; Redis still covers the rest.
 */

export interface LocalClaims {
  claim(key: string, nowMs?: number): boolean
  release(key: string): void
}

export function createLocalClaims(ttlMs: number, maxKeys = 5000): LocalClaims {
  const claims = new Map<string, number>()
  return {
    claim(key, nowMs = Date.now()) {
      const until = claims.get(key)
      if (until !== undefined && until > nowMs) return false
      if (claims.size >= maxKeys) {
        for (const [stored, expiry] of claims) if (expiry <= nowMs) claims.delete(stored)
        // Still full: forget the oldest (Map keeps insertion order).
        while (claims.size >= maxKeys) claims.delete(claims.keys().next().value as string)
      }
      claims.delete(key)
      claims.set(key, nowMs + ttlMs)
      return true
    },
    release(key) {
      claims.delete(key)
    },
  }
}
