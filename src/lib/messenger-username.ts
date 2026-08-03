/**
 * Messenger username normalization.
 *
 * `messenger_username` is the handle the "direct" redirect mode builds an m.me
 * link from. Merchants paste whatever their Facebook page shows them — a bare
 * handle, an m.me link, a full facebook.com URL, sometimes with a trailing slash
 * or a `?ref=` query — so this reduces all of those to the bare handle. Storing
 * a URL instead would produce "m.me/https://m.me/shop" at checkout.
 *
 * Pure and dependency-free: the admin form and the server action apply the same
 * rule, so what the merchant sees saved is what checkout uses.
 */

/** Hosts whose first path segment is the page handle. */
const HANDLE_HOSTS = ['m.me', 'messenger.com', 'facebook.com', 'fb.com', 'fb.me']

/** Strip a scheme and any known host prefix, leaving the path. */
const stripHost = (value: string): string => {
  const withoutScheme = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  const slash = withoutScheme.indexOf('/')
  if (slash === -1) return withoutScheme

  const host = withoutScheme.slice(0, slash).toLowerCase()
  const isKnownHost = HANDLE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))
  return isKnownHost ? withoutScheme.slice(slash + 1) : withoutScheme
}

/**
 * Reduce any Messenger page reference to its bare handle.
 * Returns '' when the input is blank or carries no handle — the caller decides
 * whether that means "cleared" or "invalid".
 */
export function normalizeMessengerUsername(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const path = stripHost(trimmed)
  // Keep only the first path segment, dropping any query string or fragment.
  const handle = path.split(/[/?#]/)[0]?.trim() ?? ''

  return handle.replace(/^@/, '')
}
