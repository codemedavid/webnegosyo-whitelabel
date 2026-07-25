'use client'

import { motion } from 'framer-motion'
import { AccentText, SectionHeading } from './cta-button'
import { LANDING_COLORS, STEPS, type Step } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.3 } as const

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl border border-white/8 p-7 md:p-8"
      style={{ backgroundColor: LANDING_COLORS.inkLift }}
    >
      <span
        className="text-[2.6rem] font-black leading-none tracking-[-0.05em]"
        style={{
          background: `linear-gradient(140deg, ${LANDING_COLORS.brand}, ${LANDING_COLORS.gold})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {step.n}
      </span>
      <h3 className="mt-4 text-lg font-black leading-snug tracking-[-0.02em] text-white">
        {step.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-white/45">{step.body}</p>
    </motion.li>
  )
}

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative z-10 scroll-mt-20 py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.ink }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          tag="How it works"
          title={
            <>
              Done-for-you setup.
              <br />
              <AccentText>Live in 48 hours.</AccentText>
            </>
          }
          body="Walang i-install, walang aaralin. Ipapadala mo lang ang menu mo — kami na ang bahala sa lahat."
        />

        <div className="relative mt-14 md:mt-16">
          {/* Connector line between the three steps on desktop */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-[86px] hidden h-px md:block"
            style={{
              background: `linear-gradient(90deg, transparent, ${LANDING_COLORS.brand}40, transparent)`,
            }}
          />
          <ol className="relative grid gap-4 md:grid-cols-3 md:gap-5">
            {STEPS.map((step, i) => (
              <StepCard key={step.n} step={step} index={i} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
