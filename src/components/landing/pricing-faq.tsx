'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { CTAButton, SectionTag } from './cta-button'
import { FAQ_ITEMS, LANDING_COLORS, PRICE_LABEL, PRICING_FEATURES } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.25 } as const

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative z-10 overflow-hidden py-24 text-center md:py-32"
      style={{ backgroundColor: LANDING_COLORS.inkSoft }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${LANDING_COLORS.brand}17` }}
      />

      <div className="relative mx-auto max-w-4xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
        >
          <SectionTag>Simple Pricing</SectionTag>
          <h2 className="text-[clamp(2rem,5.5vw,3.4rem)] font-black uppercase leading-[1.02] tracking-[-0.04em] text-white">
            One Price.
            <br />
            Everything Included.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/50">
            Walang monthly fees, walang hidden charges. Isang bayad lang — lifetime access sa buong
            Smart Menu system.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-14 max-w-md rounded-[2rem] p-[1.5px]"
          style={{
            background: `linear-gradient(160deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold}40, transparent 70%)`,
          }}
        >
          <div
            className="rounded-[calc(2rem-1.5px)] p-10"
            style={{
              background: `linear-gradient(180deg, #16100a, ${LANDING_COLORS.ink})`,
            }}
          >
            <div
              className="text-[12px] font-black uppercase tracking-[0.18em]"
              style={{ color: LANDING_COLORS.brand }}
            >
              Smart Menu System
            </div>
            <div className="mt-4 text-[3.6rem] font-black tracking-[-0.04em] text-white">
              {PRICE_LABEL}
            </div>
            <p className="text-sm text-white/40">One-time payment • Lifetime access</p>

            <ul className="mx-auto mt-8 max-w-xs space-y-0 text-left">
              {PRICING_FEATURES.map((feat) => (
                <li key={feat} className="flex items-center gap-2.5 py-2 text-sm text-white/70">
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                  {feat}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <CTAButton fullWidth>Get Smart Menu Now</CTAButton>
            </div>
            <p className="mt-3 text-[11px] text-white/30">
              No monthly fees • No contracts • Start today
            </p>
          </div>
        </motion.div>
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
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-base font-bold text-white">{q}</span>
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
            <p className="pb-5 text-sm leading-relaxed text-white/45">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FAQSection() {
  return (
    <section id="faq" className="relative z-10 py-24 md:py-32" style={{ backgroundColor: LANDING_COLORS.ink }}>
      <div className="mx-auto max-w-2xl px-5">
        <div className="text-center">
          <SectionTag>FAQ</SectionTag>
          <h2 className="text-[clamp(2rem,5.5vw,3.2rem)] font-black uppercase leading-[1.02] tracking-[-0.04em] text-white">
            Common Questions
          </h2>
        </div>

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
