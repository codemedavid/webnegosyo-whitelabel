import { CheckMark, ChalkRule, Lit, SectionTitle } from './court'
import { FeatureMock } from './feature-mockups'
import { SegmentDisplay } from './segment-display'
import { COURT, JOURNEY_FEATURES, type JourneyFeature } from './landing-theme'

function Play({ feature, index }: { feature: JourneyFeature; index: number }) {
  const isReversed = index % 2 === 1

  return (
    <div
      className={`flex flex-col items-center gap-10 md:gap-16 ${
        isReversed ? 'md:flex-row-reverse' : 'md:flex-row'
      }`}
    >
      <div className="w-full min-w-0 md:flex-1">
        <h3
          className="font-display t-play uppercase leading-[1.02] tracking-[-0.025em]"
          style={{ color: COURT.lane, textWrap: 'balance' }}
        >
          {feature.title}
        </h3>
        <p
          className="mt-4 max-w-[54ch] text-[15px] leading-relaxed"
          style={{ color: COURT.laneDim }}
        >
          {feature.body}
        </p>

        <ul className="mt-6 space-y-3">
          {feature.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 text-sm leading-snug"
              style={{ color: '#C6CCC5' }}
            >
              <CheckMark size={15} className="mt-0.5 shrink-0" />
              {point}
            </li>
          ))}
        </ul>

        {/* The payoff, read after the argument: where this play runs and what
            it puts on the board. */}
        <div className="mt-7 flex items-center gap-3.5 border-t pt-5" style={{ borderColor: 'rgba(237,232,218,0.14)' }}>
          <SegmentDisplay
            value={`+${feature.adds}`}
            color={COURT.ledAmber}
            height="1.9rem"
            label={`Nagdadagdag ng ${feature.adds} piso sa order`}
          />
          <span
            className="text-[11px] font-bold uppercase leading-tight tracking-[0.14em]"
            style={{ color: COURT.laneDim }}
          >
            {feature.when}
          </span>
        </div>
      </div>

      <div className="flex w-full justify-center md:flex-1">
        <FeatureMock variant={feature.mock} />
      </div>
    </div>
  )
}

/**
 * The three plays that run inside every order. Each one names what it adds, so
 * the section reads back against the figure the board opened with.
 */
export function FeatureJourney() {
  return (
    <section
      id="upsells"
      className="relative z-10 scroll-mt-16 overflow-hidden px-5 py-24 md:px-8 md:py-32"
      style={{ backgroundColor: COURT.groundLit }}
    >
      <div className="mx-auto max-w-6xl">
        <SectionTitle body="Ito ang pinagkaiba ng Smart Menu sa ordinaryong online menu — may nagbebenta kahit walang tao.">
          Tatlong paraan para <Lit>lumaki ang bawat order</Lit>
        </SectionTitle>

        <div className="mt-16 md:mt-24">
          {JOURNEY_FEATURES.map((feature, i) => (
            <div key={feature.title}>
              {i > 0 && <ChalkRule className="my-16 md:my-24" />}
              <Play feature={feature} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
