'use client'

// Astryx owns the inventory surface only.
//
// `reset.css` is deliberately NOT imported. It is a global, page-wide reset
// meant for a greenfield Astryx app; in a Tailwind app it lands in a CSS layer
// declared after Tailwind's own, which would give it precedence over Preflight
// on every other admin page. Astryx components carry their own styles in
// `astryx.css`, so the reset buys us nothing here and risks the rest of the
// admin.
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'

import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

interface AstryxRegionProps {
  children: React.ReactNode
}

/**
 * Scopes the Astryx design system to the subtree it wraps.
 *
 * `Theme` applies its tokens to descendants only, so the tenant admin keeps its
 * existing shell, sidebar and shadcn pages while inventory renders in Astryx.
 */
export function AstryxRegion({ children }: AstryxRegionProps) {
  return (
    <Theme theme={neutralTheme} mode="system">
      {children}
    </Theme>
  )
}
