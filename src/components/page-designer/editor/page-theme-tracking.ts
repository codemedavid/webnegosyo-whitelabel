import type { CSSProperties } from 'react'

/** Tracking page theme variables for the editor canvas. Server-safe (pure). */
export function trackingThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  void tenant
  return {}
}
