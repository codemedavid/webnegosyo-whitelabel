import { LandingViewContent } from '@/components/tracking/landing-view-content'
import { textFont } from '@/components/landing/landing-fonts'
import { FunnelFit } from './funnel-beliefs-fit'
import { FunnelCloseBand, FunnelFaq, FunnelFooter, FunnelGuarantee } from './funnel-close'
import { FunnelHeader } from './funnel-header'
import { FunnelHero } from './funnel-hero'
import { FunnelOrder } from './funnel-order'
import { FunnelProof } from './funnel-proof'
import { FunnelStack, FunnelTimeline } from './funnel-stack-timeline'
import { FunnelStickyBar } from './funnel-sticky-bar'
import { FunnelSecrets } from './funnel-secrets'
import { FunnelHook, FunnelOrigin, FunnelProblem } from './funnel-story'

/** Scoped to .funnel-world so none of it reaches the storefronts. */
const FUNNEL_STYLES = `
.funnel-world {
  font-family: var(--font-landing-text), 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}
.funnel-world .t-funnel-h1 { font-size: clamp(1.75rem, 4.2vw, 2.75rem); }
.funnel-world .t-funnel-h2 { font-size: clamp(1.6rem, 3.4vw, 2.35rem); }
.funnel-world .funnel-details > summary::-webkit-details-marker { display: none; }
.funnel-world .funnel-no-scrollbar { scrollbar-width: none; }
.funnel-world .funnel-no-scrollbar::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: no-preference) {
  html:has(.funnel-world) { scroll-behavior: smooth; }
}
`

/**
 * /funnel — one offer, written in Taglish as a Russell Brunson sales letter:
 *
 *   STAR      hook + buy box above the fold → core-desire questions → agitate
 *   STORY     three leaks → the Big Lie ("hindi mo kasalanan") → Epiphany
 *             Bridge origin → Big Domino (the new opportunity)
 *   SOLUTION  three secrets (vehicle, internal, external belief, each a lever)
 *             → proof + trial close → stack (cost of no, If/All, price reveal)
 *             → guarantee → future pacing + what happens next → take-away fit
 *             → two-options close → order form → FAQ → P.S.
 *
 * A bottom buy bar follows the visitor between the hero and the order form.
 */
export function FunnelPage() {
  return (
    <div className={`funnel-world bg-white ${textFont.variable}`}>
      <style>{FUNNEL_STYLES}</style>
      <LandingViewContent />
      <FunnelHeader />
      <main>
        <FunnelHero />
        <FunnelHook />
        <FunnelProblem />
        <FunnelOrigin />
        <FunnelSecrets />
        <FunnelProof />
        <FunnelStack />
        <FunnelGuarantee />
        <FunnelTimeline />
        <FunnelFit />
        <FunnelCloseBand />
        <FunnelOrder />
        <FunnelFaq />
      </main>
      <FunnelFooter />
      <FunnelStickyBar />
    </div>
  )
}
