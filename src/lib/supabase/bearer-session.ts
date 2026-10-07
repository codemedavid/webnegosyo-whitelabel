/**
 * A request-scoped Supabase session from an `Authorization: Bearer` header.
 *
 * The merchant app has no cookies; it calls web routes with the signed-in
 * user's own access token. A route wrapped in `withRequestBearer` makes
 * `createClient()` (src/lib/supabase/server.ts) act as that token's user for
 * the whole request — including work that outlives the handler, such as a
 * streamed answer's tool calls — so the existing readers and writers, and the
 * checks inside them (`verifyTenantAdmin`, RLS, the subscription gate), run
 * unchanged instead of being re-implemented for the app.
 *
 * GoTrue verifies the token on `auth.getUser()` exactly as it verifies a
 * cookie session; a header can't be sent ambiently, so it adds no CSRF surface.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** Access tokens are ~1KB JWTs; anything this long is not one. */
const MAX_TOKEN_LENGTH = 8192
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i

const bearerStore = new AsyncLocalStorage<string>()

export function readBearerToken(header: string | null): string | null {
  const match = header?.trim().match(BEARER_PATTERN)
  const token = match?.[1] ?? null
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null
}

/** The bearer token of the request being served, or null for a cookie request. */
export function getRequestBearerToken(): string | null {
  return bearerStore.getStore() ?? null
}

/** Run `handler` as the request's bearer user when it sent one; otherwise as usual. */
export function withRequestBearer<T>(request: Request, handler: () => T): T {
  const token = readBearerToken(request.headers.get('authorization'))
  return token ? bearerStore.run(token, handler) : handler()
}
