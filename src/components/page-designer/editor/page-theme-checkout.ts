import type { CSSProperties } from 'react'

import { getTenantBranding } from '@/lib/branding-utils'
import { checkoutThemeStyle as checkoutPaletteVars } from '@/components/customer/checkout-templates/checkout-theme'
import { CHECKOUT_BUILDER_BRIDGE } from '@/components/page-designer/checkout/checkout-builder-theme'

/**
 * Checkout page theme variables for the editor canvas. Server-safe (pure).
 * The same `--co-*` palette the live checkout sets on its root (the sample
 * blocks read it back to paint like the store), plus the bridge that points
 * the builder's own text and background colours at it, as the storefront does.
 */
export function checkoutThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  const row = tenant as Record<string, unknown>
  return {
    ...checkoutPaletteVars({ tenant: row, branding: getTenantBranding(row) }),
    ...CHECKOUT_BUILDER_BRIDGE,
  }
}
