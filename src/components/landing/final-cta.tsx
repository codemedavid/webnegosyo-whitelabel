'use client'

import { motion } from 'framer-motion'
import { CTAButton, SectionTag } from './cta-button'
import { LANDING_COLORS, PRICE_LABEL } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.4 } as const

export function FinalCTASection() {
  return (
    <section
      className="relative z-10 overflow-hidden py-28 text-center md:py-40"
      style={{
        background: `linear-gradient(180deg, ${LANDING_COLORS.ink}, #170d05)`,
      }}
    >
      <div
        className="pointer-events-none absolute bottom-[-160px] left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${LANDING_COLORS.brand}30` }}
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-3xl px-5"
      >
        <SectionTag>Last Chance</SectionTag>
        <h2 className="text-[clamp(2.4rem,7vw,4.4rem)] font-black uppercase leading-[0.96] tracking-[-0.05em] text-white">
          Stop Leaving Money
          <br />
          <span
            style={{
              background: `linear-gradient(100deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            on Every Order
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-white/50">
          Ang menu mo, kaya niya mag-sell ng mas malaki. Kailangan lang ng tamang system. I-start mo
          ngayon.
        </p>
        <div className="mt-9">
          <CTAButton size="large">Get Smart Menu Now — {PRICE_LABEL}</CTAButton>
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-white/30">
          One-time payment • No monthly fees • 48-hour setup
        </p>
      </motion.div>
    </section>
  )
}
