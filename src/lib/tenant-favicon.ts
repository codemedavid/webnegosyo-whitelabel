import type { Metadata } from 'next'
import { transformImageUrl } from '@/lib/imagekit-utils'

/** Square pixel size for the generated favicon. */
const FAVICON_SIZE = 64

type FaviconTenant = {
  logo_url?: string | null
}

/**
 * Build the `icons` metadata for a tenant so the browser-tab favicon becomes
 * the merchant's own logo.
 *
 * Returns `undefined` when the tenant has no logo, letting Next.js fall back to
 * the platform's default `favicon.ico`. ImageKit/Cloudinary logos are downsized
 * to a small square via a transform; other URLs pass through unchanged.
 */
export function resolveTenantFavicon(
  tenant: FaviconTenant | null | undefined,
): Metadata['icons'] | undefined {
  const logoUrl = tenant?.logo_url?.trim()
  if (!logoUrl) return undefined

  const iconUrl =
    transformImageUrl(logoUrl, {
      width: FAVICON_SIZE,
      height: FAVICON_SIZE,
      crop: 'fill',
    }) ?? logoUrl

  return {
    icon: [{ url: iconUrl }],
    shortcut: [{ url: iconUrl }],
    apple: [{ url: iconUrl }],
  }
}
