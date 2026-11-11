import type { CSSProperties } from 'react'

import { getTenantBranding } from '@/lib/branding-utils'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'

/**
 * Tracking page theme variables for the editor canvas: the same `--trk-*`
 * set the live page puts on its root (store branding + the owner's Order
 * status / Loyalty card look), so the sample blocks paint like the real page.
 * Server-safe (pure).
 */
export function trackingThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  const row = tenant as Record<string, unknown>
  // The canvas paints the page's own background behind the design.
  return { ...buildTrackingTheme(getTenantBranding(row), readTrackingStyle(row)), '--hb-canvas-bg': 'var(--trk-bg)' } as CSSProperties
}
