import { ChalkRule, Lit, SectionTitle } from './court'
import { COURT, PROBLEMS } from './landing-theme'

/**
 * The away side's scoring run. Not a card grid — a ledger of three leaks, each
 * one a full-width row with its loss named in scoring red.
 */
export function ProblemSection() {
  return (
    <section id="problem" className="relative z-10 px-5 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          align="left"
          body="Karamihan ng food business, may masarap na produkto pero tumutulo ang benta sa tatlong lugar na ito araw-araw."
        >
          Hindi kulang ang customers mo. <Lit color={COURT.ledRed}>Kulang ang system mo.</Lit>
        </SectionTitle>

        <ul className="mt-14 md:mt-16">
          {PROBLEMS.map((problem) => (
            <li key={problem.label}>
              <ChalkRule />
              <div className="landing-leak-row grid gap-4 py-8 md:gap-10 md:py-11">
                <p
                  className="font-display t-leak uppercase leading-none tracking-[-0.02em]"
                  style={{ color: COURT.ledRed }}
                >
                  {problem.label}
                </p>
                <div>
                  <h3
                    className="font-display t-leaktitle uppercase leading-tight tracking-[-0.015em]"
                    style={{ color: COURT.lane }}
                  >
                    {problem.title}
                  </h3>
                  <p
                    className="mt-3 max-w-[62ch] text-[15px] leading-relaxed"
                    style={{ color: COURT.laneDim }}
                  >
                    {problem.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <ChalkRule />

        <p
          className="mt-12 max-w-[54ch] font-display t-verdict uppercase leading-[1.15] tracking-[-0.02em]"
          style={{ color: COURT.lane }}
        >
          Ang Smart Menu ang sumasagot sa tatlo — isang link na tumatanggap ng order,{' '}
          <Lit>nag-a-upsell mag-isa</Lit>, at walang kinukuhang commission.
        </p>
      </div>
    </section>
  )
}
