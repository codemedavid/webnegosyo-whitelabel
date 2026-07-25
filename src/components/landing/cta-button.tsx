'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CHECKOUT_URL, LANDING_COLORS } from './landing-theme'

interface CTAButtonProps {
  children: React.ReactNode
  size?: 'default' | 'large'
  fullWidth?: boolean
  variant?: 'solid' | 'ghost'
  href?: string
}

export function CTAButton({
  children,
  size = 'default',
  fullWidth = false,
  variant = 'solid',
  href = CHECKOUT_URL,
}: CTAButtonProps) {
  const sizeClasses =
    size === 'large' ? 'px-9 py-4 text-[15px] md:px-11 md:py-5 md:text-base' : 'px-7 py-3.5 text-sm'

  const solidStyle = {
    background: `linear-gradient(135deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.brandDeep})`,
    boxShadow: `0 10px 40px ${LANDING_COLORS.brand}4d, inset 0 1px 0 rgba(255,255,255,0.2)`,
  }
  const ghostStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.14)',
  }

  const className = `group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-extrabold uppercase tracking-[0.06em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 ${sizeClasses} ${fullWidth ? 'w-full' : ''}`
  const style = variant === 'solid' ? solidStyle : ghostStyle

  const inner = (
    <>
      {variant === 'solid' && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
    </>
  )

  // In-page anchors (#section) must not go through the router.
  if (href.startsWith('#')) {
    return (
      <a href={href} className={className} style={style}>
        {inner}
      </a>
    )
  }

  return (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  )
}

export function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-600/25 bg-orange-600/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
      style={{ color: LANDING_COLORS.brand }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** Gradient-filled span used for the accented half of a headline. */
export function AccentText({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: `linear-gradient(100deg, ${LANDING_COLORS.brand} 5%, ${LANDING_COLORS.gold} 60%, #fdba74 95%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {children}
    </span>
  )
}

interface SectionHeadingProps {
  tag: string
  title: React.ReactNode
  body?: React.ReactNode
  align?: 'center' | 'left'
}

export function SectionHeading({ tag, title, body, align = 'center' }: SectionHeadingProps) {
  const alignClasses = align === 'center' ? 'mx-auto text-center' : 'text-left'

  return (
    <div className={`max-w-2xl ${alignClasses}`}>
      <SectionTag>{tag}</SectionTag>
      <h2 className="text-[clamp(1.9rem,5vw,3.2rem)] font-black uppercase leading-[1.02] tracking-[-0.04em] text-white">
        {title}
      </h2>
      {body && (
        <p
          className={`mt-5 text-[15px] leading-relaxed text-white/50 md:text-base ${align === 'center' ? 'mx-auto max-w-xl' : ''}`}
        >
          {body}
        </p>
      )}
    </div>
  )
}
