'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { JOURNEY_FEATURES, type JourneyFeature } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.4 } as const

function FeaturePanel({ feature }: { feature: JourneyFeature }) {
  const isLeft = feature.align === 'left'

  return (
    <div className="flex min-h-svh items-center">
      <div
        className={`mx-auto flex w-full max-w-6xl px-5 md:px-8 ${isLeft ? 'justify-start' : 'justify-end'}`}
      >
        <motion.div
          initial={{ opacity: 0, y: 60, x: isLeft ? -30 : 30 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/45 p-8 backdrop-blur-xl md:p-10"
          style={{ boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
        >
          <span className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-500">
            {feature.tag}
          </span>
          <h2 className="mt-4 text-[clamp(1.8rem,4.5vw,2.8rem)] font-black leading-[1.05] tracking-[-0.03em] text-white">
            {feature.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/55">{feature.body}</p>

          <ul className="mt-6 space-y-3">
            {feature.points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm font-semibold text-white/75">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600/15">
                  <Check className="h-3.5 w-3.5 text-orange-500" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
  )
}

export function FeatureJourney() {
  return (
    <section aria-label="Smart Menu features">
      {JOURNEY_FEATURES.map((feature) => (
        <FeaturePanel key={feature.tag} feature={feature} />
      ))}
    </section>
  )
}
