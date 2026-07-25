'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { AccentText, SectionHeading } from './cta-button'
import { FeatureMock } from './feature-mockups'
import { JOURNEY_FEATURES, LANDING_COLORS, type JourneyFeature } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.3 } as const

function FeatureRow({ feature, index }: { feature: JourneyFeature; index: number }) {
  const isReversed = index % 2 === 1

  return (
    <div
      className={`flex flex-col items-center gap-10 md:gap-16 ${
        isReversed ? 'md:flex-row-reverse' : 'md:flex-row'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, x: isReversed ? 24 : -24 }}
        whileInView={{ opacity: 1, y: 0, x: 0 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="w-full min-w-0 md:flex-1"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-black text-white"
            style={{
              background: `linear-gradient(140deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.brandDeep})`,
            }}
          >
            {feature.tag}
          </span>
          <span className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-500">
            {feature.eyebrow}
          </span>
        </div>

        <h3 className="mt-5 text-[clamp(1.65rem,4vw,2.5rem)] font-black leading-[1.06] tracking-[-0.03em] text-white">
          {feature.title}
        </h3>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/50">{feature.body}</p>

        <ul className="mt-6 space-y-3">
          {feature.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-sm font-semibold text-white/70">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-600/15">
                <Check className="h-3 w-3 text-orange-500" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.75, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full justify-center md:flex-1"
      >
        <FeatureMock variant={feature.mock} />
      </motion.div>
    </div>
  )
}

export function FeatureJourney() {
  return (
    <section
      id="upsells"
      aria-label="Paano nag-a-upsell ang Smart Menu"
      className="relative z-10 scroll-mt-20 overflow-hidden py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.inkSoft }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          tag="Ang upsell engine"
          title={
            <>
              Tatlong paraan para <AccentText>lumaki ang bawat order</AccentText>
            </>
          }
          body="Ito ang pinagkaiba ng Smart Menu sa ordinaryong online menu — may nagbebenta kahit walang tao."
        />

        <div className="mt-16 space-y-20 md:mt-24 md:space-y-32">
          {JOURNEY_FEATURES.map((feature, i) => (
            <FeatureRow key={feature.tag} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
