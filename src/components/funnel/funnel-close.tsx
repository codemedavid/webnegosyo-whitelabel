import Link from 'next/link'
import { ChevronRight, ShieldCheck, X } from 'lucide-react'
import { BRAND, SMARTMENU } from '@/components/landing/landing-theme'
import { CLOSE, CTA, FAQ, FOOTER, GUARANTEE, GUARANTEE_SECTION, POSTSCRIPT } from './funnel-copy'
import { CheckMark, CtaLink, FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

/** Hormozi's risk reversal, on its own stage instead of buried in the fine print. */
export function FunnelGuarantee() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20" style={{ backgroundColor: FUNNEL_TINT }}>
      <div
        className="mx-auto grid max-w-4xl gap-8 rounded-3xl bg-white p-6 shadow-lg sm:p-10 md:grid-cols-[auto_1fr] md:gap-10"
        style={{ border: `2px solid ${SMARTMENU.green}59` }}
      >
        <div className="flex flex-col items-center text-center md:w-44">
          <ShieldCheck aria-hidden className="h-20 w-20" style={{ color: SMARTMENU.green }} strokeWidth={1.5} />
          <p className="mt-3 text-[15px] font-extrabold leading-snug" style={{ color: SMARTMENU.ink }}>
            {GUARANTEE.title}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.green }}>
            {GUARANTEE_SECTION.eyebrow}
          </p>
          <h2 className="t-funnel-h2 mt-2 font-extrabold leading-[1.08] tracking-tight" style={{ color: SMARTMENU.ink }}>
            {GUARANTEE_SECTION.title}
          </h2>
          <div className="mt-4 space-y-3">
            {GUARANTEE_SECTION.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.cocoa }}>
                {paragraph}
              </p>
            ))}
          </div>
          <ul className="mt-5 space-y-2">
            {GUARANTEE_SECTION.points.map((point) => (
              <li key={point} className="flex gap-2.5 text-[15px] font-semibold" style={{ color: SMARTMENU.ink }}>
                <CheckMark />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function ChoiceCard({
  label,
  points,
  isRecommended,
}: {
  label: string
  points: readonly string[]
  isRecommended: boolean
}) {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={
        isRecommended
          ? { backgroundColor: 'rgba(255,247,238,0.08)', border: `2px solid ${SMARTMENU.amber}` }
          : { backgroundColor: 'rgba(255,247,238,0.03)', border: '1px solid rgba(255,247,238,0.14)' }
      }
    >
      <p className="font-extrabold" style={{ color: isRecommended ? SMARTMENU.amber : SMARTMENU.parchment }}>
        {label}
      </p>
      <ul className="mt-4 space-y-3">
        {points.map((point) => (
          <li
            key={point}
            className="flex gap-2.5 text-[15px] leading-snug"
            style={{ color: isRecommended ? '#FFF7EE' : SMARTMENU.parchment }}
          >
            {isRecommended ? (
              <CheckMark color={SMARTMENU.amber} />
            ) : (
              <X aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SMARTMENU.parchment }} strokeWidth={2.25} />
            )}
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Brunson's two-options close: make staying the same an explicit choice. */
export function FunnelCloseBand() {
  return (
    <section className="px-3 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-5xl rounded-3xl p-6 sm:p-10 lg:p-12" style={{ backgroundColor: SMARTMENU.ink }}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: SMARTMENU.amber }}>
            {CLOSE.eyebrow}
          </p>
          <h2 className="t-funnel-h2 mt-3 font-extrabold leading-[1.08] tracking-tight text-white">{CLOSE.title}</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <ChoiceCard label={CLOSE.stay.label} points={CLOSE.stay.points} isRecommended={false} />
          <ChoiceCard label={CLOSE.switch.label} points={CLOSE.switch.points} isRecommended />
        </div>
        <div className="mx-auto mt-8 max-w-2xl text-center">
          <p className="text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.parchment }}>
            {CLOSE.body}
          </p>
          <CtaLink size="large" tone="light" className="mt-6 w-full sm:w-auto">
            {CTA.withPrice}
          </CtaLink>
        </div>
      </div>
    </section>
  )
}

/** FAQ, then the sales letter's P.S. for the visitor who scrolled straight to the bottom. */
export function FunnelFaq() {
  return (
    <section id="faq" className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24" style={{ backgroundColor: FUNNEL_TINT }}>
      <SectionTitle title={FAQ.title} />
      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {FAQ.items.map((item) => (
          <details key={item.q} className="funnel-details group rounded-2xl bg-white shadow-sm">
            <summary
              className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-bold"
              style={{ color: SMARTMENU.ink }}
            >
              {item.q}
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
            </summary>
            <p className="px-5 pb-5 text-[14.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-3xl rounded-2xl bg-white p-6 sm:p-8" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
        <p className="text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.ink }}>
          <strong>P.S.</strong> {POSTSCRIPT.ps}
        </p>
        <p className="mt-4 text-[15px] leading-relaxed sm:text-base" style={{ color: SMARTMENU.ink }}>
          <strong>P.P.S.</strong> {POSTSCRIPT.pps}
        </p>
        <div className="mt-6 text-center">
          <CtaLink size="large" className="w-full sm:w-auto">
            {CTA.withPrice}
          </CtaLink>
          <p className="mt-3 text-[12.5px]" style={{ color: SMARTMENU.cocoa }}>
            {CTA.reassurance}
          </p>
        </div>
      </div>
    </section>
  )
}

export function FunnelFooter() {
  return (
    <footer className="border-t px-4 pb-28 pt-10 sm:px-6" style={{ borderColor: FUNNEL_LINE }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="text-lg font-extrabold" style={{ color: SMARTMENU.ink }}>
            {BRAND.name} <span className="text-sm font-semibold" style={{ color: SMARTMENU.cocoa }}>{BRAND.byline}</span>
          </p>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
            {FOOTER.blurb}
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-6">
          {FOOTER.links.map((link) => (
            <Link key={link.href} href={link.href} className="text-[14px] hover:underline" style={{ color: SMARTMENU.cocoa }}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-[12px]" style={{ color: SMARTMENU.cocoa }}>
        © {new Date().getFullYear()} WebNegosyo. All rights reserved.
      </p>
    </footer>
  )
}
