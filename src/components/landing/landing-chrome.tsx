'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion, useScroll, useSpring } from 'framer-motion'
import {
  CHECKOUT_URL,
  LANDING_COLORS,
  MARQUEE_ITEMS,
  NAV_LINKS,
  PRICE_LABEL,
} from './landing-theme'

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left"
      style={{
        scaleX,
        background: `linear-gradient(90deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold})`,
      }}
    />
  )
}

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#f6f1e7] shadow-[0_4px_16px_rgba(234,88,12,0.25)]">
            <Image
              src="/webnegosyo-logo.png"
              alt="WebNegosyo logo"
              width={40}
              height={40}
              className="scale-[1.7]"
              priority
            />
          </span>
          <span className="text-sm font-black uppercase tracking-[0.14em] text-white">
            WebNegosyo
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Landing sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-bold uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href={CHECKOUT_URL}
          className="rounded-full px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-md transition-all hover:brightness-110"
          style={{
            background: `linear-gradient(135deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.brandDeep})`,
            boxShadow: `0 6px 24px ${LANDING_COLORS.brand}40`,
          }}
        >
          Get Started — {PRICE_LABEL}
        </Link>
      </div>
      {/* Blur veil behind nav */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/30 to-transparent backdrop-blur-[6px] [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" />
    </header>
  )
}

export function FeatureMarquee() {
  const row = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <div
      className="relative z-10 overflow-hidden border-y border-white/8 py-5"
      style={{ backgroundColor: 'rgba(6,4,3,0.9)' }}
    >
      <div className="landing-marquee flex w-max items-center gap-10">
        {row.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-10 whitespace-nowrap text-sm font-extrabold uppercase tracking-[0.22em] text-white/35"
          >
            {item}
            <span className="text-orange-600/60">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function GrainOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[55]"
      style={{
        opacity: 0.02,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  )
}

export function LandingFooter() {
  return (
    <footer
      className="relative z-10 border-t border-white/6 py-12"
      style={{ backgroundColor: LANDING_COLORS.ink }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 text-center md:px-8">
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#f6f1e7]">
          <Image
            src="/webnegosyo-logo.png"
            alt="WebNegosyo logo"
            width={44}
            height={44}
            className="scale-[1.7]"
          />
        </span>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3" aria-label="Footer">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/privacy"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white"
          >
            Privacy
          </Link>
          <Link
            href="/support"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white"
          >
            Support
          </Link>
        </nav>

        <p className="text-xs text-white/25">
          WebNegosyo • Smart Menu System para sa food business • © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
