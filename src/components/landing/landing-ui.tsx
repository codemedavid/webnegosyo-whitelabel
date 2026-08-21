import Link from 'next/link'
import Image from 'next/image'
import { SMARTMENU, type LandingPhoto } from './landing-theme'

/**
 * Rounded brand button — the logo's friendly geometry as a control. `sun` is
 * the amber variant for dark photo sections; `ghost` inherits the surface.
 */
export function BrandButton({
  children,
  href = '/checkout',
  tone = 'red',
  size = 'base',
}: {
  children: React.ReactNode
  href?: string
  tone?: 'red' | 'sun' | 'ghost-dark' | 'ghost-light'
  size?: 'base' | 'large'
}) {
  const tones: Record<string, React.CSSProperties> = {
    red: {
      backgroundColor: SMARTMENU.red,
      color: '#FFF7EE',
      boxShadow: `0 14px 30px -12px ${SMARTMENU.red}B3`,
    },
    sun: {
      backgroundColor: SMARTMENU.amber,
      color: SMARTMENU.ink,
      boxShadow: `0 14px 30px -12px ${SMARTMENU.amber}99`,
    },
    'ghost-dark': {
      backgroundColor: 'rgba(255, 247, 238, 0.08)',
      color: '#FFF7EE',
      border: '1px solid rgba(255, 247, 238, 0.32)',
      backdropFilter: 'blur(6px)',
    },
    'ghost-light': {
      backgroundColor: 'transparent',
      color: SMARTMENU.ink,
      border: `1.5px solid ${SMARTMENU.ink}33`,
    },
  }

  return (
    <Link
      href={href}
      className={`font-display inline-flex items-center justify-center rounded-full text-center font-bold transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
        size === 'large' ? 'px-8 py-4 text-base md:text-lg' : 'px-5 py-2.5 text-sm'
      }`}
      style={tones[tone]}
    >
      {children}
    </Link>
  )
}

export function CheckIcon({ size = 14, color = SMARTMENU.green }: { size?: number; color?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <circle cx="8" cy="8" r="8" fill={color} opacity="0.16" />
      <path d="M4.5 8.3 7 10.8l4.5-5.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Amber eyebrow line above section headings — the sun ray from the logo. */
export function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p
      className="mb-4 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.22em]"
      style={{ color: onDark ? SMARTMENU.amber : SMARTMENU.red }}
    >
      <span aria-hidden className="h-px w-8" style={{ backgroundColor: SMARTMENU.amber }} />
      {children}
    </p>
  )
}

/** A registered photograph rendered through next/image. */
export function Photo({
  photo,
  className = '',
  sizes = '100vw',
  priority = false,
  fill = true,
  decorative = false,
}: {
  photo: LandingPhoto
  className?: string
  sizes?: string
  priority?: boolean
  fill?: boolean
  decorative?: boolean
}) {
  return (
    <Image
      src={photo.src}
      alt={decorative ? '' : photo.alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  )
}
