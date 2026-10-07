import { Gift, Lock, PlayCircle, ShieldCheck, ChevronRight, Clock } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import {
  BONUS,
  CTA,
  GUARANTEE,
  HERO,
  HERO_DETAILS,
  PAYMENT_NOTE,
  PLAN,
} from './funnel-copy'
import { FUNNEL_PRICE, OFFER_NAME, formatPeso } from './funnel-offer'
import { CheckMark, CtaLink, FUNNEL_LINE, FUNNEL_TINT } from './funnel-ui'

function PlanCard() {
  return (
    <div
      className="rounded-2xl border-2 bg-white p-4 shadow-sm sm:p-6"
      style={{ borderColor: SMARTMENU.ink }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: SMARTMENU.ink }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SMARTMENU.ink }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight" style={{ color: SMARTMENU.ink }}>
              {OFFER_NAME}
            </h2>
            {PLAN.badges.map((badge, index) => (
              <span
                key={badge}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.06em]"
                style={
                  index === 0
                    ? { backgroundColor: SMARTMENU.ink, color: '#FFF7EE' }
                    : { backgroundColor: SMARTMENU.amber, color: SMARTMENU.ink }
                }
              >
                {badge}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: SMARTMENU.red }}>
              {formatPeso(FUNNEL_PRICE)}
            </span>
            <span className="text-sm font-semibold" style={{ color: SMARTMENU.cocoa }}>
              {PLAN.priceUnit}
            </span>
            <span className="text-sm line-through" style={{ color: SMARTMENU.cocoa }}>
              {PLAN.anchorNote}
            </span>
            <span
              className="rounded px-2 py-0.5 text-[11px] font-extrabold tracking-[0.06em]"
              style={{ backgroundColor: `${SMARTMENU.green}1F`, color: SMARTMENU.green }}
            >
              {PLAN.saveBadge}
            </span>
          </div>
        </div>
      </div>

      <hr className="my-4" style={{ borderColor: FUNNEL_LINE }} />
      <ul className="space-y-2.5">
        {PLAN.includes.map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-snug" style={{ color: SMARTMENU.ink }}>
            <CheckMark />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p
        className="mt-4 rounded-xl px-3.5 py-3 text-[13px] leading-snug"
        style={{ backgroundColor: `${SMARTMENU.amber}1F`, color: SMARTMENU.ink, border: `1px solid ${SMARTMENU.amber}66` }}
      >
        {PLAN.requirement}
      </p>
    </div>
  )
}

function BonusCard() {
  return (
    <div>
      <p className="my-4 text-center text-[11px] font-bold tracking-[0.2em]" style={{ color: SMARTMENU.cocoa }}>
        --- {BONUS.divider} ---
      </p>
      <div className="flex gap-3 rounded-2xl p-4 sm:p-5" style={{ backgroundColor: FUNNEL_TINT, border: `1px solid ${FUNNEL_LINE}` }}>
        <Gift aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: SMARTMENU.red }} />
        <div>
          <p className="font-extrabold" style={{ color: SMARTMENU.ink }}>
            {BONUS.title}{' '}
            <span className="font-bold" style={{ color: SMARTMENU.red }}>
              ({BONUS.valueNote}, {BONUS.freeTag})
            </span>
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
            {BONUS.body}
          </p>
        </div>
      </div>
    </div>
  )
}

function TrustRow() {
  return (
    <div className="mt-5 border-t pt-5 text-center" style={{ borderColor: FUNNEL_LINE }}>
      <p className="text-[13px]" style={{ color: SMARTMENU.cocoa }}>
        {PAYMENT_NOTE.lead}{' '}
        {PAYMENT_NOTE.methods.map((method, index) => (
          <span key={method}>
            {index > 0 && PAYMENT_NOTE.joiner}
            <strong style={{ color: SMARTMENU.ink }}>{method}</strong>
          </span>
        ))}
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px]" style={{ color: SMARTMENU.cocoa }}>
        {PAYMENT_NOTE.points.map((point, index) => (
          <span key={point} className="inline-flex items-center gap-1.5">
            {index === 0 ? <Lock aria-hidden className="h-3.5 w-3.5" /> : <ShieldCheck aria-hidden className="h-3.5 w-3.5" />}
            {point}
          </span>
        ))}
      </p>
    </div>
  )
}

function GuaranteeCard() {
  return (
    <div className="mt-5 flex gap-4 rounded-2xl p-4 sm:p-5" style={{ backgroundColor: `${SMARTMENU.green}12` }}>
      <ShieldCheck aria-hidden className="h-9 w-9 shrink-0" style={{ color: SMARTMENU.green }} strokeWidth={1.75} />
      <div>
        <p className="font-extrabold" style={{ color: SMARTMENU.ink }}>
          {GUARANTEE.title}
        </p>
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
          {GUARANTEE.body}
        </p>
      </div>
    </div>
  )
}

/** Native <details> accordions: keyboard and screen-reader ready, no JavaScript. */
function DetailsList() {
  return (
    <div className="mt-6 border-t" style={{ borderColor: FUNNEL_LINE }}>
      {HERO_DETAILS.map((detail) => (
        <details key={detail.title} className="funnel-details group border-b" style={{ borderColor: FUNNEL_LINE }}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[13.5px] font-extrabold uppercase tracking-wide" style={{ color: SMARTMENU.ink }}>
            {detail.title}
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
          </summary>
          <p className="pb-5 text-[14px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
            {detail.body}
          </p>
        </details>
      ))}
    </div>
  )
}

/** The hook: positioning, headline, promise and the demo link. */
export function FunnelHeroIntro() {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] sm:tracking-[0.2em]" style={{ color: SMARTMENU.red }}>
        {HERO.callout}
      </p>
      <h1 className="t-funnel-h1 font-extrabold leading-[1.05] tracking-tight" style={{ color: SMARTMENU.ink }}>
        {HERO.title}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.cocoa }}>
        {HERO.subtitle}
      </p>
      <a
        href="#demo"
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold"
        style={{ color: SMARTMENU.red }}
      >
        <PlayCircle aria-hidden className="h-5 w-5" />
        {HERO.demoLabel}
      </a>
    </div>
  )
}

/** The reference's buy box: the one plan, bonus, CTA, trust, guarantee, details. */
export function FunnelBuyBox() {
  return (
    <div>
      <PlanCard />
      <BonusCard />

      <div id="hero-cta" className="mt-5">
        <CtaLink size="large" className="w-full">
          {CTA.primary} →
        </CtaLink>
        <p className="mt-2.5 text-center text-[12.5px] font-semibold" style={{ color: SMARTMENU.ink }}>
          {CTA.reassurance}
        </p>
        <p className="mt-1.5 flex items-start justify-center gap-1.5 text-center text-[12.5px]" style={{ color: SMARTMENU.cocoa }}>
          <Clock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: SMARTMENU.red }} />
          {CTA.scarcity}
        </p>
      </div>

      <TrustRow />
      <GuaranteeCard />
      <DetailsList />
    </div>
  )
}
