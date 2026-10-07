import { SMARTMENU } from '@/components/landing/landing-theme'
import { FIT } from './funnel-copy'
import { CheckMark, CrossMark, FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

export function FunnelFit() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-24" style={{ backgroundColor: FUNNEL_TINT }}>
      <SectionTitle title={FIT.title} subtitle={FIT.subtitle} />
      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: '#FFFFFF', border: `1.5px solid ${SMARTMENU.green}59` }}
        >
          <p className="flex items-center gap-2 text-[13px] font-extrabold tracking-[0.08em]" style={{ color: SMARTMENU.green }}>
            <CheckMark />
            {FIT.forYouTitle}
          </p>
          <ul className="mt-4 space-y-3">
            {FIT.forYou.map((line) => (
              <li key={line} className="flex gap-2.5 text-[14.5px] leading-snug" style={{ color: SMARTMENU.ink }}>
                <CheckMark />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-6" style={{ border: `1.5px solid ${FUNNEL_LINE}` }}>
          <p className="text-[13px] font-extrabold tracking-[0.08em]" style={{ color: SMARTMENU.cocoa }}>
            {FIT.notForYouTitle}
          </p>
          <ul className="mt-4 space-y-3">
            {FIT.notForYou.map((line) => (
              <li key={line} className="flex gap-2.5 text-[14.5px] leading-snug" style={{ color: SMARTMENU.cocoa }}>
                <CrossMark />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t pt-4 text-[13px] leading-relaxed" style={{ borderColor: FUNNEL_LINE, color: SMARTMENU.cocoa }}>
            {FIT.note}
          </p>
        </div>
      </div>
    </section>
  )
}
