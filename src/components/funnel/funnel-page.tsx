import { LandingViewContent } from '@/components/tracking/landing-view-content'
import { MarketingPixel } from '@/components/tracking/marketing-pixel'
import { FunnelBonuses } from './funnel-bonuses'
import { FunnelCloseBand, FunnelFaq, FunnelFooter } from './funnel-close'
import { FunnelFeatures } from './funnel-features'
import { FunnelHeader } from './funnel-header'
import { FunnelHero } from './funnel-hero'
import { FunnelOrder } from './funnel-order'
import { FunnelProof } from './funnel-proof'
import { FunnelStickyBar } from './funnel-sticky-bar'
import { FunnelWorld } from './funnel-world'

/**
 * /funnel, rebuilt on the contentacademy.io class page's design system (its
 * type scale, glows, CTA and card recipes were read off the live page with
 * REA): countdown bar, highlighter headline, the tools as three numbered
 * phases over real app screens, proof, bonus cards, then the plans (six
 * months chosen) with the order form, FAQ and one last call.
 */
export function FunnelPage() {
  return (
    <FunnelWorld>
      <MarketingPixel />
      <LandingViewContent />
      <FunnelHeader />
      <main>
        <FunnelHero />
        <FunnelFeatures />
        <FunnelProof />
        <FunnelBonuses />
        <FunnelOrder />
        <FunnelFaq />
        <FunnelCloseBand />
      </main>
      <FunnelFooter />
      <FunnelStickyBar />
    </FunnelWorld>
  )
}
