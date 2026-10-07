import { ShieldCheck } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { GUARANTEE, ORDER, PLAN } from './funnel-copy'
import { FUNNEL_ORDER_ANCHOR, FUNNEL_PRICE, OFFER_NAME, SETUP_FEE_WAIVED, formatPeso } from './funnel-offer'
import { FunnelOrderForm } from './funnel-order-form'
import { CheckMark, FUNNEL_LINE, FUNNEL_TINT, SectionTitle } from './funnel-ui'

function OrderSummary() {
  return (
    <aside className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: FUNNEL_TINT, border: `1px solid ${FUNNEL_LINE}` }}>
      <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: SMARTMENU.cocoa }}>
        {ORDER.summaryTitle}
      </h3>
      <dl className="mt-4 space-y-3 text-[14.5px]" style={{ color: SMARTMENU.ink }}>
        <div className="flex justify-between gap-4">
          <dt>
            {OFFER_NAME}
            <span className="block text-[12.5px]" style={{ color: SMARTMENU.cocoa }}>{ORDER.firstMonth}</span>
          </dt>
          <dd className="font-bold tabular-nums">{formatPeso(FUNNEL_PRICE)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{ORDER.setupLine}</dt>
          <dd className="tabular-nums">
            <span className="mr-2 line-through" style={{ color: SMARTMENU.cocoa }}>{formatPeso(SETUP_FEE_WAIVED)}</span>
            <span className="font-bold" style={{ color: SMARTMENU.green }}>₱0</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-3 text-base font-extrabold" style={{ borderColor: FUNNEL_LINE }}>
          <dt>{ORDER.dueToday}</dt>
          <dd className="tabular-nums" style={{ color: SMARTMENU.red }}>{formatPeso(FUNNEL_PRICE)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>{ORDER.renewalNote}</p>
      <ul className="mt-5 space-y-2 border-t pt-4" style={{ borderColor: FUNNEL_LINE }}>
        {PLAN.includes.map((line) => (
          <li key={line} className="flex gap-2 text-[13px] leading-snug" style={{ color: SMARTMENU.ink }}>
            <CheckMark />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-3 rounded-xl bg-white p-4">
        <ShieldCheck aria-hidden className="h-6 w-6 shrink-0" style={{ color: SMARTMENU.green }} />
        <p className="text-[12.5px] leading-relaxed" style={{ color: SMARTMENU.cocoa }}>
          <strong style={{ color: SMARTMENU.ink }}>{GUARANTEE.title}.</strong> {GUARANTEE.body}
        </p>
      </div>
    </aside>
  )
}

/** Step two of the funnel, on the same page: the order form beside what they're getting. */
export function FunnelOrder() {
  return (
    <section id={FUNNEL_ORDER_ANCHOR} className="scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
      <SectionTitle eyebrow={ORDER.eyebrow} title={ORDER.title} subtitle={ORDER.subtitle} />
      <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <div className="rounded-2xl bg-white p-5 shadow-lg sm:p-8" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
          <FunnelOrderForm />
        </div>
        <OrderSummary />
      </div>
    </section>
  )
}
