import Image from 'next/image'
import { BRAND, SMARTMENU } from '@/components/landing/landing-theme'
import { CTA, NAV_ITEMS } from './funnel-copy'
import { CtaLink, FUNNEL_LINE } from './funnel-ui'

export function FunnelHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur"
      style={{ borderColor: FUNNEL_LINE }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
          <Image src="/smartmenu-mark.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
          <span className="text-lg font-extrabold tracking-tight" style={{ color: SMARTMENU.ink }}>
            {BRAND.name}
          </span>
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: SMARTMENU.ink }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <CtaLink>{CTA.short}</CtaLink>
      </div>
    </header>
  )
}
