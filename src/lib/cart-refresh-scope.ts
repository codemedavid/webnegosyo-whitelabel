/**
 * Whether the cart should re-read its dishes while on `pathname`.
 *
 * CartProvider sits in the root layout, so it is mounted in the merchant admin
 * and the platform console too. There the refresh is invisible work — a
 * Supabase read 1s after every hydration and on every tab focus, for a cart a
 * merchant left behind while testing their own store. Only the storefront
 * shows a cart, so only the storefront refreshes it.
 *
 * Both path shapes are covered: `/<slug>/admin/...` on the platform host and
 * `/admin/...` on a tenant's own host (before the middleware rewrite, which
 * the browser never sees).
 */
export function shouldRefreshCartOnPath(pathname: string): boolean {
  const [first, second] = pathname.split('/').filter(Boolean)
  if (first === 'superadmin' || first === 'admin') return false
  return second !== 'admin'
}
