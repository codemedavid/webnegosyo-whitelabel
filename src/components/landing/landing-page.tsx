import { CapabilitiesSection } from './capabilities-section'
import { FAQSection, PricingSection } from './pricing-faq'
import { FeatureJourney } from './feature-journey'
import { FinalCTASection } from './final-cta'
import { HowItWorksSection } from './how-it-works'
import { LandingFooter, LandingNav, SponsorStrip } from './landing-chrome'
import { LandingHero } from './landing-hero'
import { ProblemSection } from './problem-section'
import { SocialProofSection, StatsBand } from './social-proof'
import { landingFontClass } from './landing-fonts'
import { LANDING_STYLES } from './landing-styles'
import { COURT } from './landing-theme'

/**
 * The direction contract for this surface. Emitted as a real HTML comment so
 * it survives the production build and can be audited in the shipped markup.
 */
const DIRECTION_CONTRACT = `<!--
impeccable seed ecdd84d8 — WebNegosyo landing page (Persuade)
THESIS: The product is a total that goes up, so the page is a barangay-court scoreboard. It refuses the dark-SaaS hero with a glowing phone, gradient pills, and a uniform feature-card grid.
OWN-WORLD: Asphalt-green near-black court under floodlight; seven-segment LED figures in amber, scoring red, and home green, with unlit segments always visible; painted chalk lane rules; controls are angled lane plates that depress on press; capabilities are printed CMYK sponsor tarpaulins with grommets and hard-shadow lettering; Anton display, Archivo text.
STORY: A Filipino food-business owner understands that every order is leaking money to manual work, forgotten upsells, and 20-30% commission; believes one link they own can add the pairing, the meal upgrade, and the bundle automatically; and buys the one-time PHP 3,899 Smart Menu.
FIRST VIEWPORT: Dark court, floodlight pool, painted centre arc. The steel scoreboard leads (right on desktop, first on phones): HOME "MENU MO" in green segments climbing 149 to 417 as three play lamps fire, versus AWAY "KOMISYON" locked at 0, with the synthetic-order caption beneath. Left: the Taglish headline, one-liner, the red lane-plate primary action "Kunin - PHP 3,899", a chalk secondary, and four trust marks.
FORM: Barangay Scoreboard, candidate 6 of 7 on the grounded list, assigned by concept-seed key ecdd84d8.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`

export function LandingPage() {
  return (
    <div className={`landing-world ${landingFontClass}`} style={{ backgroundColor: COURT.ground }}>
      <div aria-hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
      <style>{LANDING_STYLES}</style>

      <LandingNav />
      <main>
        <LandingHero />
        <SponsorStrip />
        <ProblemSection />
        <CapabilitiesSection />
        <HowItWorksSection />
        <FeatureJourney />
        <StatsBand />
        <SocialProofSection />
        <PricingSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <LandingFooter />
    </div>
  )
}
