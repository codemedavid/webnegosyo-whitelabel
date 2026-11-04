import Link from 'next/link'
import { Plus } from 'lucide-react'
import { BRAND } from '@/components/landing/landing-theme'
import { CountdownChip } from './funnel-countdown'
import { CLOSE, FAQ, FOOTER } from './funnel-copy'
import { CtaLink, Kicker, SectionTitle } from './funnel-ui'

export function FunnelFaq() {
  return (
    <section id="faq" className="scroll-mt-20 px-5 py-20">
      <div className="mx-auto max-w-[720px]">
        <SectionTitle title={FAQ.title} />
        <div className="mt-10 border-t fn-rule">
          {FAQ.items.map((item) => (
            <details key={item.q} className="fn-details group border-b fn-rule">
              <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium text-white">
                {item.q}
                <Plus aria-hidden className="h-4 w-4 shrink-0 text-[#F5A623] transition-transform group-open:rotate-45" strokeWidth={2} />
              </summary>
              <p className="fn-body pb-5 pr-8">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The reference's final block: amber label, serif headline, short line, one button, the clock. */
export function FunnelCloseBand() {
  return (
    <section className="px-5 pb-24 pt-8 text-center">
      <div className="mx-auto max-w-[600px]">
        <Kicker tone="amber">{CLOSE.label}</Kicker>
        <h2 className="fn-h2 fn-serif !mt-4 !font-normal !tracking-[-0.01em]">{CLOSE.title}</h2>
        <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-relaxed text-[#A99C8D]">{CLOSE.body}</p>
        <div className="mt-8">
          <CtaLink size="large" isPulsing>{CLOSE.cta}</CtaLink>
        </div>
        <div className="mt-6 flex justify-center">
          <CountdownChip />
        </div>
      </div>
    </section>
  )
}

export function FunnelFooter() {
  return (
    <footer className="border-t px-5 pb-28 pt-10 fn-rule">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="text-[15px] font-semibold text-white">
            {BRAND.name} <span className="text-[13px] font-normal text-[#A99C8D]">{BRAND.byline}</span>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#A99C8D]">{FOOTER.blurb}</p>
        </div>
        <nav aria-label="Footer" className="flex gap-6">
          {FOOTER.links.map((link) => (
            <Link key={link.href} href={link.href} className="text-[13px] text-[#A99C8D] hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-[1180px] text-[12px] text-[#A99C8D]">© {new Date().getFullYear()} WebNegosyo. All rights reserved.</p>
    </footer>
  )
}
