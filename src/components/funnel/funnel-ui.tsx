import { ArrowRight, Check, X } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { FUNNEL_CTA_HREF } from './funnel-offer'

/**
 * The /funnel palette is SmartMenu's own (landing-theme SMARTMENU): the dark
 * stage is the warm "night" the landing photos settle into, red is the action
 * colour, amber the accent and highlighter, cream the text. Red and green are
 * lifted a step where they sit as small text on night, so they stay readable.
 */
export const FN = {
  bg: SMARTMENU.night,
  panel: '#1D1713',
  raised: '#261E19',
  line: '#30271F',
  text: '#FFFFFF',
  text2: '#EFE6D8',
  body: SMARTMENU.parchment,
  muted: '#A99C8D',
  marker: SMARTMENU.amber,
  markerInk: SMARTMENU.ink,
  amber: SMARTMENU.amber,
  red: SMARTMENU.red,
  redDeep: SMARTMENU.redDeep,
  /** Brand red lifted for text and glows on night. */
  redBright: '#FF5E4A',
  /** Brand green lifted for text on night. */
  green: '#3CC47C',
} as const

/**
 * The one call to action: the reference's glass pill (SmartMenu red, hairline
 * rim, inset light, a slow shimmer). Every button scrolls to the plans and order
 * form, so a visitor is never sent away from the funnel to say yes.
 */
export function CtaLink({
  children,
  size = 'base',
  isPulsing = false,
  className = '',
  href = FUNNEL_CTA_HREF,
}: {
  children: React.ReactNode
  size?: 'base' | 'large'
  isPulsing?: boolean
  className?: string
  href?: string
}) {
  const sizeClass = size === 'large' ? 'fn-cta--large' : 'fn-cta--small'
  return (
    <a href={href} className={`fn-cta ${sizeClass} ${isPulsing ? 'fn-cta--pulse' : ''} ${className}`}>
      <span className="text-balance">{children}</span>
      <ArrowRight aria-hidden className={size === 'large' ? 'h-[18px] w-[18px] shrink-0' : 'h-3.5 w-3.5 shrink-0'} strokeWidth={2.5} />
    </a>
  )
}

export function CheckMark({ color = FN.amber }: { color?: string }) {
  return <Check aria-hidden className="mt-[3px] h-4 w-4 shrink-0" style={{ color }} strokeWidth={2.5} />
}

export function CrossMark() {
  return <X aria-hidden className="mt-[3px] h-4 w-4 shrink-0" style={{ color: FN.muted }} strokeWidth={2} />
}

/** The reference's glowing red kicker ("● FREE LIVE MASTERCLASS"). */
export function Kicker({ children, tone = 'red' }: { children: React.ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <p className={`fn-kicker fn-kicker--${tone}`}>
      <span aria-hidden className="fn-dot" />
      {children}
    </p>
  )
}

/** Highlighter-pen words, revealed left to right like the reference's marker. */
export function Marker({ children }: { children: React.ReactNode }) {
  return <mark className="fn-marker">{children}</mark>
}

export function SectionTitle({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string
  title: React.ReactNode
  subtitle?: string
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h2 className="fn-h2">{title}</h2>
      {subtitle && <p className="fn-lead mx-auto mt-4 max-w-2xl">{subtitle}</p>}
    </div>
  )
}
