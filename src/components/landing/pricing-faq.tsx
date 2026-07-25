'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, XCircle } from 'lucide-react'
import { AccentText, CTAButton, SectionHeading } from './cta-button'
import { FAQ_ITEMS, LANDING_COLORS, PRICE_LABEL, PRICING_FEATURES } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.2 } as const

const EXCLUSIONS = ['Monthly subscription', 'Commission kada order', 'Setup fee', 'Lock-in contract'] as const

function PricingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-14 max-w-lg rounded-[2rem] p-[1.5px]"
      style={{
        background: `linear-gradient(160deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold}40, transparent 70%)`,
      }}
    >
      <div
        className="rounded-[calc(2rem-1.5px)] p-8 md:p-10"
        style={{ background: `linear-gradient(180deg, #16100a, ${LANDING_COLORS.ink})` }}
      >
        <div
          className="text-[12px] font-black uppercase tracking-[0.18em]"
          style={{ color: LANDING_COLORS.brand }}
        >
          Smart Menu System
        </div>

        <div className="mt-4 flex items-end justify-center gap-2">
          <span className="text-[3.4rem] font-black leading-none tracking-[-0.04em] text-white">
            {PRICE_LABEL}
          </span>
          <span className="pb-2 text-sm font-bold text-white/35">one-time</span>
        </div>
        <p className="mt-2 text-sm text-white/40">Lifetime access • Walang renewal</p>

        <ul className="mt-8 space-y-0 text-left">
          {PRICING_FEATURES.map((feat) => (
            <li
              key={feat}
              className="flex items-start gap-3 border-b border-white/5 py-2.5 text-[13.5px] text-white/75 last:border-0"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              {feat}
            </li>
          ))}
        </ul>

        <div className="mt-7">
          <CTAButton fullWidth size="large">
            Get Smart Menu Now
          </CTAButton>
        </div>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {EXCLUSIONS.map((item) => (
            <li key={item} className="flex items-center gap-1.5 text-[11px] font-bold text-white/30">
              <XCircle className="h-3.5 w-3.5 text-white/20" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative z-10 scroll-mt-20 overflow-hidden py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.inkSoft }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${LANDING_COLORS.brand}17` }}
      />

      <div className="relative mx-auto max-w-4xl px-5">
        <SectionHeading
          tag="Simple pricing"
          title={
            <>
              Isang bayad. <AccentText>Buo ang system.</AccentText>
            </>
          }
          body="Walang monthly fees, walang hidden charges, walang commission kada order. Isang bayad lang — lifetime access sa buong Smart Menu system."
        />
        <PricingCard />
      </div>
    </section>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-white/8">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-bold text-white md:text-base">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-orange-500/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-8 text-sm leading-relaxed text-white/50">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FAQSection() {
  return (
    <section
      id="faq"
      className="relative z-10 scroll-mt-20 py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.ink }}
    >
      <div className="mx-auto max-w-2xl px-5">
        <SectionHeading tag="FAQ" title="Mga madalas itanong" />

        <div className="mt-12">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <CTAButton>Get Started — {PRICE_LABEL}</CTAButton>
        </div>
      </div>
    </section>
  )
}
