import { Gift } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { CTA, PLAN, STACK, TIMELINE } from './funnel-copy'
import { FUNNEL_PRICE, VALUE_STACK, formatPeso, stackTotalValue } from './funnel-offer'
import { CheckMark, CtaLink, FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

/** Brunson's "cost of saying no": what the old way costs before the price appears. */
function PriceAnchor() {
  return (
    <div className="border-b px-4 py-5 sm:px-6" style={{ backgroundColor: `${SMARTMENU.red}0D`, borderColor: FUNNEL_LINE }}>
      <p className="font-extrabold" style={{ color: SMARTMENU.ink }}>
        {STACK.anchorTitle}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
        {STACK.anchorBody}
      </p>
    </div>
  )
}

/** The If/All statements: one small "yes" per secret before the price reveal. */
function IfAllList() {
  return (
    <ul className="space-y-2.5 border-b px-4 py-5 sm:px-6" style={{ borderColor: FUNNEL_LINE }}>
      {STACK.ifAll.map((line) => (
        <li key={line} className="flex gap-2.5 text-[14.5px] font-semibold leading-snug" style={{ color: SMARTMENU.ink }}>
          <CheckMark color={SMARTMENU.amber} />
          {line}
        </li>
      ))}
    </ul>
  )
}

/**
 * Brunson's stack slide: a permission-style transition, every piece with its
 * value, the cost of saying no, the If/All yeses, the total, then the price.
 */
export function FunnelStack() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-24">
      <SectionTitle eyebrow={STACK.eyebrow} title={STACK.title} subtitle={STACK.transition} />
      <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl bg-white shadow-lg" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
        <ul>
          {VALUE_STACK.map((item) => (
            <li
              key={item.title}
              className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6"
              style={{ borderColor: FUNNEL_LINE, backgroundColor: item.isBonus ? `${SMARTMENU.amber}14` : undefined }}
            >
              <div className="flex min-w-0 gap-3">
                {item.isBonus ? (
                  <Gift aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SMARTMENU.red }} />
                ) : (
                  <CheckMark />
                )}
                <div className="min-w-0">
                  <p className="font-bold leading-snug" style={{ color: SMARTMENU.ink }}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug" style={{ color: SMARTMENU.cocoa }}>
                    {item.detail}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[15px] font-bold tabular-nums" style={{ color: SMARTMENU.ink }}>
                <span className="sr-only">{STACK.valueHeader}: </span>
                {formatPeso(item.value)}
              </span>
            </li>
          ))}
        </ul>
        <PriceAnchor />
        <IfAllList />
        <div className="px-4 py-6 text-center sm:px-6" style={{ backgroundColor: FUNNEL_TINT }}>
          <p className="text-[14px]" style={{ color: SMARTMENU.cocoa }}>
            {STACK.totalLabel}:{' '}
            <span className="font-bold line-through tabular-nums">{formatPeso(stackTotalValue())}</span>
          </p>
          <p className="mx-auto mt-3 max-w-md text-balance text-[15px] font-bold leading-snug" style={{ color: SMARTMENU.ink }}>
            {STACK.reveal}
          </p>
          <p className="mt-4 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: SMARTMENU.cocoa }}>
            {STACK.todayLabel}
          </p>
          <p className="mt-1 font-extrabold tabular-nums" style={{ color: SMARTMENU.red }}>
            <span className="text-5xl">{formatPeso(FUNNEL_PRICE)}</span>
            <span className="text-lg">{PLAN.priceUnit}</span>
          </p>
          <p className="mt-1 text-[14px]" style={{ color: SMARTMENU.cocoa }}>
            {STACK.daily}
          </p>
          <CtaLink size="large" className="mt-6 w-full sm:w-auto">
            {CTA.primary} →
          </CtaLink>
          <p className="mt-3 text-[12.5px]" style={{ color: SMARTMENU.cocoa }}>
            {CTA.reassurance}
          </p>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-2xl text-center text-[12px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
        {STACK.valueNote}
      </p>
    </section>
  )
}

/** Future pacing ("imagine…"), then what actually happens after they say yes. */
export function FunnelTimeline() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto mb-14 max-w-3xl rounded-3xl p-6 sm:p-10" style={{ backgroundColor: FUNNEL_TINT, border: `1px solid ${FUNNEL_LINE}` }}>
        <p className="text-xl font-extrabold leading-snug sm:text-2xl" style={{ color: SMARTMENU.ink }}>
          {TIMELINE.imagineTitle}
        </p>
        <p className="mt-3 text-[16px] leading-relaxed sm:text-lg" style={{ color: SMARTMENU.ink }}>
          {TIMELINE.imagine}
        </p>
      </div>
      <SectionTitle title={TIMELINE.title} subtitle={TIMELINE.subtitle} />
      <ol className="mx-auto mt-10 max-w-3xl space-y-4">
        {TIMELINE.steps.map((step, index) => (
          <li key={step.when} className="flex gap-3.5 rounded-2xl bg-white p-4 shadow-sm sm:gap-5 sm:p-6" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold sm:h-10 sm:w-10"
              style={{ backgroundColor: SMARTMENU.red, color: '#FFF7EE' }}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: SMARTMENU.red }}>
                {step.when}
              </p>
              <h3 className="mt-0.5 text-lg font-extrabold leading-snug" style={{ color: SMARTMENU.ink }}>
                {step.title}
              </h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
