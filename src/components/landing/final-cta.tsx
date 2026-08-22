import { BrandButton, Photo } from './landing-ui'
import { CHECKOUT_URL, LANDING_PHOTOS, MONTHLY_PRICE_LABEL, PRICE_LABEL, SMARTMENU } from './landing-theme'

/**
 * The close: heavy bold type, left-aligned, over the dining room the owner is
 * trying to fill. The reverse of the hero's slide-over ends the arc.
 */
export function FinalCTASection() {
  return (
    <section className="noise vignette relative overflow-hidden px-5 py-24 md:px-8 md:py-36" style={{ backgroundColor: SMARTMENU.night }}>
      <div className="absolute inset-0">
        <Photo photo={LANDING_PHOTOS.interior} sizes="100vw" className="opacity-40" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${SMARTMENU.night}F2 10%, ${SMARTMENU.night}59 100%)` }}
        />
      </div>

      <div className="rise relative mx-auto max-w-6xl">
        <p className="font-serif text-xl italic" style={{ color: SMARTMENU.amber }}>
          Growing restaurants. Together.
        </p>
        <h2 className="font-display t-hero mt-4 max-w-[16ch] leading-[1.02] text-white" style={{ textWrap: 'balance' }}>
          Handa na ang mesa. Buksan mo na ang{' '}
          <span className="font-serif italic" style={{ color: SMARTMENU.amber }}>
            menu mo.
          </span>
        </h2>
        <p className="t-lead mt-6 max-w-[46ch] leading-relaxed" style={{ color: SMARTMENU.parchment }}>
          {PRICE_LABEL} setup + {MONTHLY_PRICE_LABEL}/buwan, live within 48 hours, at kusang
          nag-uupsell mula sa unang order.
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <BrandButton size="large" href={CHECKOUT_URL}>
            Kunin ang Smart Menu — {PRICE_LABEL}
          </BrandButton>
          <BrandButton size="large" tone="ghost-dark" href="#faq">
            May tanong pa ako
          </BrandButton>
        </div>
      </div>
    </section>
  )
}
