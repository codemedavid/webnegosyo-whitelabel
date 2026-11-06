/**
 * Finds where a short map link goes, by reading its redirects.
 *
 * Only Google's short-link hosts are ever fetched, each hop is checked before
 * the next request, and the first full map URL ends the walk: nothing
 * customer-supplied can point this server anywhere else.
 */

import { locationFromMapUrl, shortMapLink, type PastedLocation } from './pasted-location'

const MAX_HOPS = 4
const REQUEST_TIMEOUT_MS = 5_000

export type LinkFetch = (
  url: string,
  init: { method: string; redirect: 'manual'; signal: AbortSignal },
) => Promise<{ status: number; headers: { get(name: string): string | null } }>

function nextUrl(location: string, from: string): URL | null {
  try {
    return new URL(location, from)
  } catch {
    return null
  }
}

/** Google's consent page wraps the real map link in `continue`. */
function unwrapConsent(url: URL): URL {
  if (url.hostname !== 'consent.google.com') return url
  const inner = url.searchParams.get('continue')
  return (inner && nextUrl(inner, url.href)) || url
}

/** The spot or place behind a short link, or null when it leads nowhere readable. */
export async function resolveShortMapLink(url: string, fetchImpl: LinkFetch): Promise<PastedLocation | null> {
  let current = url
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) return null

    const target = nextUrl(location, current)
    if (!target) return null
    const unwrapped = unwrapConsent(target)
    const found = locationFromMapUrl(unwrapped)
    if (found) return found

    const short = shortMapLink(unwrapped)
    if (!short) return null
    current = short
  }
  return null
}
