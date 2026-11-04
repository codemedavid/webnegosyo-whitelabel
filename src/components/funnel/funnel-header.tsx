import Image from 'next/image'
import { BRAND } from '@/components/landing/landing-theme'
import { CountdownDigits } from './funnel-countdown'
import { HEADER } from './funnel-copy'
import { CtaLink } from './funnel-ui'

/** The reference's sticky glass bar: logo, the deal's live countdown, one small pill. */
export function FunnelHeader() {
  return (
    <header className="fn-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-4">
        <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <Image src="/smartmenu-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px] bg-[#FBF6ED] object-contain p-0.5" />
          <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-white sm:inline">{BRAND.name}</span>
        </a>
        <CountdownDigits />
        {/* On phones the countdown fills the bar; the bottom buy bar carries the button there. */}
        <span className="hidden shrink-0 sm:block">
          <CtaLink>{HEADER.cta}</CtaLink>
        </span>
      </div>
    </header>
  )
}
