import { Lit, SectionTitle } from './court'
import { COURT, STEPS } from './landing-theme'

/**
 * Three quarters of setup. The sequence carries real information — what you
 * send, what we do, when you go live — so the markers are the game clock, and
 * a painted line runs the whole play from left to right.
 */
export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative z-10 scroll-mt-16 px-5 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionTitle body="Walang i-install, walang aaralin. Ipapadala mo lang ang menu mo — kami na ang bahala sa lahat.">
          Done-for-you setup. <Lit>Live in 48 hours.</Lit>
        </SectionTitle>

        <ol className="relative mt-16 grid gap-10 md:mt-20 md:grid-cols-3 md:gap-8">
          {/* The painted line the play runs along. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-[34px] hidden h-[3px] md:block"
            style={{
              background: `repeating-linear-gradient(90deg, ${COURT.lane}26 0 24px, transparent 24px 38px)`,
            }}
          />

          {STEPS.map((step) => (
            <li key={step.n} className="relative">
              <span
                className="relative inline-flex items-center justify-center px-4 py-2.5 font-display text-2xl uppercase leading-none tracking-[0.02em] md:text-[1.75rem]"
                style={{
                  color: COURT.ground,
                  backgroundColor: COURT.ledAmber,
                  clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)',
                }}
              >
                {step.n}
              </span>
              <h3
                className="mt-6 font-display t-step uppercase leading-[1.06] tracking-[-0.02em]"
                style={{ color: COURT.lane }}
              >
                {step.title}
              </h3>
              <p
                className="mt-3.5 max-w-[46ch] text-[15px] leading-relaxed"
                style={{ color: COURT.laneDim }}
              >
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
