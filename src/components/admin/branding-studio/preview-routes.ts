/**
 * Branding Studio preview-route mapping.
 *
 * Maps each editor surface to the real storefront route the live preview
 * iframe should load. Kept as a pure module (no React) so the mapping is unit
 * testable and shared between the frame and the studio.
 *
 * Notes on two surfaces that are NOT their own route:
 *  - `cart` previews the menu page with the right-side CartDrawer opened, since
 *    that drawer — not the standalone `/cart` page — is the cart customers see.
 *  - `product` navigates to the real product detail page for a sample item so
 *    its ~97 product_detail_settings are visible and editable in place.
 */

import type { BrandingSurface } from '@/lib/branding-registry'

export interface PreviewTarget {
  /** Storefront path the iframe should load (no query string). */
  path: string
  /** When true, the storefront opens the cart drawer in preview mode. */
  openCart?: boolean
}

export function getPreviewTarget(
  tenantSlug: string,
  surfaceId: BrandingSurface['id'],
  sampleItemId?: string | null
): PreviewTarget {
  const base = `/${tenantSlug}`
  switch (surfaceId) {
    case 'cart':
      // Cart drawer overlays the menu; the storefront opens it via the draft.
      return { path: `${base}/menu`, openCart: true }
    case 'checkout':
    case 'upsell':
      return { path: `${base}/checkout` }
    case 'product':
      return {
        path: sampleItemId ? `${base}/menu/item/${sampleItemId}` : `${base}/menu`,
      }
    default:
      // global / storefront / footer / flash all live on the menu page.
      return { path: `${base}/menu` }
  }
}
