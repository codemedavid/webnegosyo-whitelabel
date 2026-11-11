import type { CSSProperties } from 'react'

import { checkoutThemeVars, resolveCheckoutTheme } from '@/components/customer/checkout-templates/checkout-theme'
import { getTenantBranding } from '@/lib/branding-utils'

/**
 * Thank-you page theme variables for the editor canvas: the same `--co-*`
 * set the live page sets on its root (checkoutThemeStyle), resolved from the
 * tenant's checkout columns + brand. Server-safe (pure).
 */
export function confirmationThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  const row = tenant as Record<string, unknown>
  return checkoutThemeVars(resolveCheckoutTheme(row, getTenantBranding(row)))
}
