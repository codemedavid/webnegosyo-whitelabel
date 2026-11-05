import type { ReactNode } from 'react'

import { cornersClass, type CornersChoice } from '@/lib/page-designer/knobs'

interface BlockCardProps {
  /** Branding Studio click-to-inspect scope, as on the standard designs. */
  scope?: 'checkout/card' | 'checkout/summary'
  isCard: boolean
  /** The card's corners (`auto` = standard). */
  corners?: CornersChoice
  title?: string
  subtitle?: string
  children: ReactNode
}

const CARD_SURFACE: Record<NonNullable<BlockCardProps['scope']>, string> = {
  'checkout/card': 'bg-[var(--co-card)]',
  'checkout/summary': 'bg-[var(--co-summary)]',
}

/**
 * A checkout section as a designed page shows it: the title and the line
 * under it, on a card (the owner can switch the card off and style the
 * widget instead). Colours are the checkout theme's (`--co-*`).
 */
export function BlockCard({ scope = 'checkout/card', isCard, corners, title, subtitle, children }: BlockCardProps) {
  const surface = isCard
    ? `${cornersClass(corners, 'rounded-2xl')} border border-[color:var(--co-border)] p-5 shadow-sm sm:p-6 ${CARD_SURFACE[scope]}`
    : ''
  return (
    <section data-branding-scope={scope} className={`text-[color:var(--co-text)] ${surface}`}>
      {(title || subtitle) && (
        <div className="mb-4 sm:mb-5">
          {title && <h2 className="text-lg font-bold leading-tight text-[color:var(--co-text)] sm:text-xl">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm text-[color:var(--co-muted)]">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  )
}
