import { CourtButton, Grommets, VINYL_SHEEN } from './court'
import { PRICE_LABEL, TARP } from './landing-theme'

/**
 * The buzzer. The page ends on printed vinyl rather than fading out on the
 * court — the loudest, most physical surface in the world, hung last.
 */
export function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden px-5 py-24 text-center md:px-8 md:py-32"
      style={{ backgroundImage: VINYL_SHEEN, backgroundColor: TARP.red, color: TARP.vinyl }}
    >
      <Grommets inset="wide" />

      <div className="mx-auto max-w-3xl">
        <h2
          className="font-display t-close uppercase leading-[0.9] tracking-[-0.03em]"
          style={{ textShadow: '3px 3px 0 rgba(0,0,0,0.22)', textWrap: 'balance' }}
        >
          Tapusin mo na ang pagpapatulo ng benta.
        </h2>
        <p className="mx-auto mt-6 max-w-[48ch] text-[15px] leading-relaxed md:text-base" style={{ opacity: 0.9 }}>
          Ang menu mo, kaya niyang magbenta ng mas malaki. Kailangan lang ng tamang system — at 48
          hours para ma-live ito.
        </p>

        {/* Scoring red vanishes on red vinyl, so the plate here is printed
            stock: cream board, dark ink, the way a tarp sets its own panel. */}
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <CourtButton size="large" tone="vinyl">
            Kunin — {PRICE_LABEL}
          </CourtButton>
          <CourtButton size="large" tone="tarpGhost" ghostFill={TARP.red} href="#faq">
            May tanong pa ako
          </CourtButton>
        </div>

        <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ opacity: 0.75 }}>
          One-time payment • No monthly fees • 48-hour setup
        </p>
      </div>
    </section>
  )
}
