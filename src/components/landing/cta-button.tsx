'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CHECKOUT_URL, LANDING_COLORS } from './landing-theme'

interface CTAButtonProps {
  children: React.ReactNode
  size?: 'default' | 'large'
  fullWidth?: boolean
  variant?: 'solid' | 'ghost'
}

export function CTAButton({
  children,
  size = 'default',
  fullWidth = false,
  variant = 'solid',
}: CTAButtonProps) {
  const sizeClasses = size === 'large' ? 'px-12 py-5 text-base md:text-lg' : 'px-8 py-4 text-sm'

  const solidStyle = {
    background: `linear-gradient(135deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.brandDeep})`,
    boxShadow: `0 10px 40px ${LANDING_COLORS.brand}4d, inset 0 1px 0 rgba(255,255,255,0.2)`,
  }
  const ghostStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
  }

  return (
    <Link
      href={CHECKOUT_URL}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-extrabold uppercase tracking-[0.08em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 ${sizeClasses} ${fullWidth ? 'w-full' : ''}`}
      style={variant === 'solid' ? solidStyle : ghostStyle}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {children}
      <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  )
}

export function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-600/25 bg-orange-600/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
      style={{ color: LANDING_COLORS.brand }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
