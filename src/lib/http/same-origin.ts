/**
 * A cookie-authenticated request must come from a page on the same host.
 * The session cookie is sent automatically, so without this a page elsewhere
 * could submit on the signed-in person's behalf. Bearer-token callers (the
 * merchant app) need no such check: a token is never attached by the browser
 * on its own.
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
