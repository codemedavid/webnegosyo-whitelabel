import { CapabilitiesSection } from './capabilities-section'
import { FAQSection, PricingSection } from './pricing-faq'
import { FeatureJourney } from './feature-journey'
import { FinalCTASection } from './final-cta'
import { FourMoresSection } from './four-mores'
import { HowItWorksSection } from './how-it-works'
import { LandingFooter, LandingNav, SponsorStrip } from './landing-chrome'
import { LandingHero } from './landing-hero'
import { ProblemSection } from './problem-section'
import { SocialProofSection, StatsBand } from './social-proof'
import { landingFontClass } from './landing-fonts'
import { LANDING_STYLES } from './landing-styles'
import { SMARTMENU } from './landing-theme'

/**
 * The direction contract for this surface. Emitted as a real HTML comment so
 * it survives the production build and can be audited in the shipped markup.
 */
const DIRECTION_CONTRACT = `<!--
SmartMenu landing — designed for the audience, not the template
THESIS: A site that says "for restaurants" must design like it has met one. Real photography, darkened and grained until the type reads; the palette pulled from the logo (signal red, sun amber, ink, cream); a serif mixed into the sans like a printed menu.
IDENTITY: SmartMenu by WebNegosyo — "Growing restaurants. Together." Baloo 2 carries the wordmark's rounded geometry, Fraunces gives headlines the printed-menu voice, Figtree does the reading work.
WIREFRAME: photographic hero with a till-receipt demo and scattered plates → capability ribbon → problem over the dining room → cream graph-paper capability wall → big-image steps → full-bleed rotating feature tabs → stats, demo, testimonials → printed-menu pricing → FAQ → bold type over the room to fill.
MOTION: two motifs, repeated — sections rise over the receding hero (reversed at the close), and photographs rotate on a timer with a breath on hover. Reduced motion is honored everywhere.
-->`

export function LandingPage() {
  return (
    <div className={`landing-world ${landingFontClass}`} style={{ backgroundColor: SMARTMENU.cream }}>
      <div aria-hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
      <style>{LANDING_STYLES}</style>

      <LandingNav />
      <main>
        <LandingHero />
        <SponsorStrip />
        <ProblemSection />
        <FourMoresSection />
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
