'use client'

import { motion } from 'framer-motion'
import {
  Gauge,
  Layers,
  Palette,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { CTAButton, SectionHeading } from './cta-button'
import {
  CAPABILITIES,
  LANDING_COLORS,
  PRICE_LABEL,
  type Capability,
  type CapabilityIcon,
} from './landing-theme'

const VIEWPORT = { once: true, amount: 0.2 } as const

const ICONS: Record<CapabilityIcon, LucideIcon> = {
  store: Store,
  sparkles: Sparkles,
  layers: Layers,
  truck: Truck,
  gauge: Gauge,
  palette: Palette,
  wallet: Wallet,
  phone: Smartphone,
}

function CapabilityCard({ capability, index }: { capability: Capability; index: number }) {
  const Icon = ICONS[capability.icon]

  return (
    <motion.li
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.55, delay: (index % 4) * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden rounded-2xl border border-white/8 p-6 transition-colors duration-300 hover:border-orange-600/35 md:p-7"
      style={{ backgroundColor: LANDING_COLORS.inkLift }}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
        style={{
          background: `linear-gradient(140deg, ${LANDING_COLORS.brand}2e, ${LANDING_COLORS.gold}14)`,
          border: `1px solid ${LANDING_COLORS.brand}33`,
        }}
      >
        <Icon className="h-5 w-5" style={{ color: LANDING_COLORS.gold }} />
      </span>
      <h3 className="mt-5 text-[15px] font-black leading-snug tracking-[-0.01em] text-white md:text-base">
        {capability.title}
      </h3>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/45">{capability.body}</p>
    </motion.li>
  )
}

export function CapabilitiesSection() {
  return (
    <section
      id="what-you-get"
      className="relative z-10 scroll-mt-20 overflow-hidden py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.inkSoft }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${LANDING_COLORS.brand}12` }}
      />

      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          tag="What you get"
          title="Lahat ng ito, isang bayad lang."
          body="Hindi lang ito website builder. Ito ang buong sistema ng pag-order ng food business mo — mula sa unang tingin ng customer hanggang sa order na dumating sa kusina mo."
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 md:mt-16 lg:grid-cols-4">
          {CAPABILITIES.map((capability, i) => (
            <CapabilityCard key={capability.title} capability={capability} index={i} />
          ))}
        </ul>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6 }}
          className="mt-12 text-center"
        >
          <CTAButton>Kunin lahat — {PRICE_LABEL}</CTAButton>
          <p className="mt-3 text-xs text-white/30">
            Walang add-on, walang tier. Buo agad ang system pagka-live mo.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
