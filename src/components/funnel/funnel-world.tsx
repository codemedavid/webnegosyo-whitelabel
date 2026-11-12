import type { ReactNode } from 'react'
import { funnelFontClass } from './funnel-fonts'
import { FUNNEL_STYLES } from './funnel-styles'

/**
 * The funnel's look (fonts, palette, `.funnel-world` styles) for a page of its
 * own, e.g. /checkout/confirmation. The funnel itself already sits inside one.
 */
export function FunnelWorld({ children }: { children: ReactNode }) {
  return (
    <div className={`funnel-world min-h-screen ${funnelFontClass}`}>
      <style>{FUNNEL_STYLES}</style>
      {children}
    </div>
  )
}
