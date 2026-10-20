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
 *  - `tracking` and `loyalty` open the order page with a sample order.
 */

import type { BrandingSurface } from '@/lib/branding-registry'
import { TRACKING_PREVIEW_ORDER_ID } from '@/lib/branding-studio/tracking-preview'

export interface PreviewTarget {
  /** Storefront path the iframe should load (no query string). */
  path: string
  /** When true, the storefront opens the cart drawer in preview mode. */
  openCart?: boolean
}

export function getPreviewTarget(
  tenantSlug: string,
  surfaceId: BrandingSurface['id'],
  sampleItemId?: string | null,
  /** Cart surfaces: the drawer over the menu (default) or the full cart page. */
  cartView: 'drawer' | 'page' = 'drawer'
): PreviewTarget {
  const base = `/${tenantSlug}`
  switch (surfaceId) {
    case 'cart':
    case 'upsell':
      // The cart drawer over the menu, or the cart page (which follows the Cart
      // layout setting). The "last call" offers (Upsell Modal) show in both.
      return cartView === 'page' ? { path: `${base}/cart` } : { path: `${base}/menu`, openCart: true }
    case 'checkout':
      return { path: `${base}/checkout` }
    case 'tracking':
    case 'loyalty':
      // A sample order (no real order or token needed); the loyalty card sits on it.
      return { path: `${base}/order/${TRACKING_PREVIEW_ORDER_ID}` }
    case 'layout':
      // A storefront pack draws the tenant home (legacy shows its menu there).
      return { path: base }
    case 'product':
      return {
        path: sampleItemId ? `${base}/menu/item/${sampleItemId}` : `${base}/menu`,
      }
    default:
      // global / storefront / footer / flash all live on the menu page.
      return { path: `${base}/menu` }
  }
}
