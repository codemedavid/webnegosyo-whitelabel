import type { CSSProperties } from 'react'

/** Confirmation page theme variables for the editor canvas. Server-safe (pure). */
export function confirmationThemeStyle(tenant: Readonly<Record<string, unknown>>): CSSProperties {
  void tenant
  return {}
}
