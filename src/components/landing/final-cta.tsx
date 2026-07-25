'use client'

import { motion } from 'framer-motion'
import { AccentText, CTAButton, SectionTag } from './cta-button'
import { LANDING_COLORS, PRICE_LABEL } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.4 } as const

export function FinalCTASection() {
  return (
    <section
      className="relative z-10 overflow-hidden py-28 text-center md:py-40"
      style={{ background: `linear-gradient(180deg, ${LANDING_COLORS.ink}, #170d05)` }}
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
        <SectionTag>Simulan mo na</SectionTag>
        <h2 className="text-[clamp(2.2rem,7vw,4.2rem)] font-black uppercase leading-[0.97] tracking-[-0.05em] text-white">
          Stop leaving money
          <br />
          <AccentText>on every order</AccentText>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-white/55">
          Ang menu mo, kaya niyang magbenta ng mas malaki. Kailangan lang ng tamang system — at
          48 hours para ma-live ito.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CTAButton size="large">Get Smart Menu — {PRICE_LABEL}</CTAButton>
          <CTAButton size="large" variant="ghost" href="#faq">
            May tanong pa ako
          </CTAButton>
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/30">
          One-time payment • No monthly fees • 48-hour setup
        </p>
      </motion.div>
    </section>
  )
}
