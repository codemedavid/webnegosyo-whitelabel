import { notFound, redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { resolveOutletDeepLink } from '@/lib/outlets/deep-link'

/**
 * `/b/{slug}` — the branch link a merchant prints on signage, a QR code, or an
 * ad. It resolves to a redirect into the ordinary menu with `?outlet={slug}`,
 * so there is exactly one storefront and one place that decides what a branch
 * link means.
 *
 * The prefixed form was chosen over a bare root-level `/{slug}` deliberately:
 * a root segment competes with every existing tenant route, and `b` is on the
 * reserved-slug list so no outlet can ever shadow the prefix itself.
 */

/** Rebuild the incoming query string so campaign params survive the redirect. */
function toSearchString(entries: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === 'string') params.append(key, value)
    else if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
  }
  return params.toString()
}

export default async function OutletDeepLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; outletSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ tenant: tenantSlug, outletSlug }, query] = await Promise.all([params, searchParams])

  const tenant = await getCachedTenantBySlug(tenantSlug)

  // Unknown tenant, or one that never opted in: the path 404s exactly as it
  // does today, before this route existed.
  if (!tenant || !isMultiBranchEnabled(tenant)) {
    notFound()
  }

  const resolution = resolveOutletDeepLink({
    isEnabled: true,
    tenantSlug,
    rawSlug: outletSlug,
    search: toSearchString(query),
  })

  if (resolution.kind === 'not-found') {
    notFound()
  }

  redirect(resolution.location)
}
