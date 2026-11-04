import type { CSSProperties } from 'react'

/** Checkout page theme variables for the editor canvas. Server-safe (pure). */
export function checkoutThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  void tenant
  return {}
}
