'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { AccentText, CTAButton } from './cta-button'
import { HERO_TRUST_POINTS, PRICE_LABEL, PRODUCT_ONE_LINER } from './landing-theme'

const HEADLINE_LINES = ['Your Menu', 'Should Sell', 'For You.'] as const

const lineVariants = {
  hidden: { opacity: 0, y: 48 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, delay: 0.15 + i * 0.1, ease: [0.16, 1, 0.3, 1] as const },
  }),
}

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] as const },
  }
}

export function LandingHero() {
  return (
    <section className="landing-hero-copy relative flex min-h-svh flex-col items-center justify-center px-5 pb-16 pt-24 text-center lg:items-start lg:px-8">
      {/* Scrims so the copy stays readable over the 3D scene */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,4,3,0.6),rgba(6,4,3,0.2)_45%,transparent_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-black/75 lg:hidden" />
      {/* On desktop the phone sits right of the copy — darken only the copy side */}
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-3/5 bg-gradient-to-r from-black/80 via-black/55 to-transparent lg:block" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="max-w-xl lg:max-w-2xl">
          <motion.p
            {...fadeUp(0.05)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/65 backdrop-blur-md"
          >
            <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            Para sa food business — one-time {PRICE_LABEL}
          </motion.p>

          <h1 className="text-[clamp(2.7rem,8.5vw,5.8rem)] font-black uppercase leading-[0.93] tracking-[-0.05em] text-white">
            {HEADLINE_LINES.map((line, i) => (
              <motion.span
                key={line}
                custom={i}
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="block"
              >
                {i === 1 ? <AccentText>{line}</AccentText> : line}
              </motion.span>
            ))}
          </h1>

          {/* The plain-language "what is this" line — the thing the old hero never said. */}
          <motion.p
            {...fadeUp(0.55)}
            className="mx-auto mt-6 max-w-xl text-[clamp(1rem,2.2vw,1.2rem)] leading-relaxed text-white/70 lg:mx-0"
          >
            {PRODUCT_ONE_LINER}
          </motion.p>

          <motion.div
            {...fadeUp(0.68)}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <CTAButton size="large">Get Smart Menu — {PRICE_LABEL}</CTAButton>
            <CTAButton size="large" variant="ghost" href="#what-you-get">
              Ano ang kasama?
            </CTAButton>
          </motion.div>

          <motion.ul
            {...fadeUp(0.82)}
            className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2.5 lg:mx-0 lg:justify-start"
          >
            {HERO_TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/45"
              >
                <Check className="h-3.5 w-3.5 text-orange-500" />
                {point}
              </li>
            ))}
          </motion.ul>
        </div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 1 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:hidden"
        aria-hidden
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-11 w-7 items-start justify-center rounded-full border border-white/20 p-2"
        >
          <div className="h-2 w-1 rounded-full bg-white/50" />
        </motion.div>
      </motion.div>
    </section>
  )
}
