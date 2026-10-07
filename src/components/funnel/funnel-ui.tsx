import { Check, X } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { FUNNEL_CTA_HREF } from './funnel-offer'

/** Section tint — the logo's cream plate, used where the reference alternates bands. */
export const FUNNEL_TINT = SMARTMENU.cream
export const FUNNEL_LINE = `${SMARTMENU.ink}14`

/**
 * The one call to action. Every button on the page scrolls to the order form,
 * so a visitor is never sent away from the funnel to say yes.
 */
export function CtaLink({
  children,
  size = 'base',
  tone = 'red',
  className = '',
}: {
  children: React.ReactNode
  size?: 'base' | 'large'
  tone?: 'red' | 'light'
  className?: string
}) {
  const isLight = tone === 'light'
  return (
    <a
      href={FUNNEL_CTA_HREF}
      className={`inline-flex items-center justify-center rounded-full text-center font-bold tracking-tight transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0 ${
        size === 'large' ? 'min-h-14 px-5 py-3.5 text-[15px] leading-snug text-balance sm:px-7 sm:py-4 sm:text-lg' : 'min-h-11 px-5 py-2.5 text-sm'
      } ${className}`}
      style={{
        backgroundColor: isLight ? '#FFFFFF' : SMARTMENU.red,
        color: isLight ? SMARTMENU.ink : '#FFF7EE',
        boxShadow: isLight ? 'none' : `0 14px 30px -14px ${SMARTMENU.red}B3`,
        outlineColor: SMARTMENU.amber,
      }}
    >
      {children}
    </a>
  )
}

export function CheckMark({ color = SMARTMENU.green }: { color?: string }) {
  return <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} strokeWidth={2.5} />
}

export function CrossMark() {
  return <X aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SMARTMENU.cocoa }} strokeWidth={2.25} />
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'center' | 'left'
}) {
  const isCenter = align === 'center'
  return (
    <div className={isCenter ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      {eyebrow && (
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.red }}>
          {eyebrow}
        </p>
      )}
      <h2 className="t-funnel-h2 font-extrabold leading-[1.08] tracking-tight" style={{ color: SMARTMENU.ink }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.cocoa }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
