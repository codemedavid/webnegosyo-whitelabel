'use client'

import { motion } from 'framer-motion'
import { AccentText, SectionHeading } from './cta-button'
import { LANDING_COLORS, PROBLEMS, type ProblemCard } from './landing-theme'

const VIEWPORT = { once: true, amount: 0.3 } as const

function ProblemTile({ problem, index }: { problem: ProblemCard; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-white/8 p-7 md:p-8"
      style={{ backgroundColor: LANDING_COLORS.inkLift }}
    >
      <span className="text-[11px] font-black uppercase tracking-[0.24em] text-white/25">
        {problem.stat}
      </span>
      <h3 className="mt-3 text-lg font-black leading-snug tracking-[-0.02em] text-white md:text-xl">
        {problem.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-white/45">{problem.body}</p>
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${LANDING_COLORS.brand}66, transparent)`,
        }}
      />
    </motion.li>
  )
}

export function ProblemSection() {
  return (
    <section
      id="problem"
      className="relative z-10 py-24 md:py-32"
      style={{ backgroundColor: LANDING_COLORS.ink }}
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <SectionHeading
          tag="Ang totoong problema"
          title={
            <>
              Hindi kulang ang customers mo.
              <br />
              <AccentText>Kulang ang system mo.</AccentText>
            </>
          }
          body="Karamihan ng food business, may masarap na produkto pero tumutulo ang benta sa tatlong lugar na ito araw-araw."
        />

        <ul className="mt-14 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-5">
          {PROBLEMS.map((problem, i) => (
            <ProblemTile key={problem.stat} problem={problem} index={i} />
          ))}
        </ul>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-12 max-w-xl text-center text-base font-bold leading-relaxed text-white/70 md:text-lg"
        >
          Ang Smart Menu ang sumasagot sa tatlo — isang link na tumatanggap ng order, nag-a-upsell
          mag-isa, at walang kinukuhang commission.
        </motion.p>
      </div>
    </section>
  )
}
