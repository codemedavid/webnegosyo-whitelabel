import { Calculator, MapPin } from 'lucide-react'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { HERO } from './funnel-copy'
import { FunnelBuyBox, FunnelHeroIntro } from './funnel-buy-box'
import { FunnelGallery } from './funnel-gallery'
import { FUNNEL_LINE } from './funnel-ui'

/**
 * Above the fold. Desktop follows the reference: a sticky gallery column on
 * the left, headline and buy box on the right. Phones read in DOM order —
 * headline, gallery, offer — so the promise and the price arrive in the first
 * screen instead of after a full screen of photos.
 */
export function FunnelHero() {
  return (
    <section id="top" className="scroll-mt-20 px-4 pb-14 pt-6 sm:px-6 sm:pt-8 lg:pb-20 lg:pt-14">
      <div className="mx-auto grid max-w-6xl gap-6 sm:gap-8 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-6">
        <div className="lg:col-start-2 lg:row-start-1">
          <FunnelHeroIntro />
        </div>

        <div className="lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
          <p
            className="t-funnel-h2 mx-auto mb-6 hidden max-w-md text-center font-extrabold leading-[1.1] tracking-tight lg:block"
            style={{ color: SMARTMENU.ink }}
          >
            {HERO.galleryHeadline}
          </p>
          <FunnelGallery />
          <p
            className="mx-auto mt-4 flex w-fit max-w-full items-center gap-2 rounded-full bg-white px-4 py-2 text-center text-[13px] font-medium shadow-md sm:mt-5"
            style={{ color: SMARTMENU.ink, border: `1px solid ${FUNNEL_LINE}` }}
          >
            <MapPin aria-hidden className="h-4 w-4 shrink-0" style={{ color: SMARTMENU.red }} />
            <span className="lg:hidden">{HERO.trustPillShort}</span>
            <span className="hidden lg:inline">{HERO.trustPill}</span>
          </p>
          {/* The same ₱33-a-day math closes the beliefs section, so phones skip it here. */}
          <div className="mt-5 hidden rounded-2xl bg-white p-5 shadow-sm lg:block" style={{ border: `1px solid ${FUNNEL_LINE}` }}>
            <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: SMARTMENU.ink }}>
              <Calculator aria-hidden className="h-4 w-4" style={{ color: SMARTMENU.amber }} />
              {HERO.mathTitle}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: SMARTMENU.ink }}>
              {HERO.mathBody}
            </p>
          </div>
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <FunnelBuyBox />
        </div>
      </div>
    </section>
  )
}
