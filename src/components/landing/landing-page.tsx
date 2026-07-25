'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import {
  FeatureMarquee,
  GrainOverlay,
  LandingFooter,
  LandingNav,
  ScrollProgressBar,
} from './landing-chrome'
import { LandingHero } from './landing-hero'
import { ProblemSection } from './problem-section'
import { CapabilitiesSection } from './capabilities-section'
import { HowItWorksSection } from './how-it-works'
import { FeatureJourney } from './feature-journey'
import { SocialProofSection, StatsBand } from './social-proof'
import { FAQSection, PricingSection } from './pricing-faq'
import { FinalCTASection } from './final-cta'
import { SceneErrorBoundary } from './scene-error-boundary'
import { LANDING_COLORS } from './landing-theme'

const HeroCanvas = dynamic(() => import('./hero-canvas'), { ssr: false })

const MARQUEE_KEYFRAMES = `
@keyframes landing-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.landing-marquee {
  animation: landing-marquee 30s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .landing-marquee { animation: none; }
}
`

function StaticSceneFallback() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${LANDING_COLORS.brand}1f, transparent 60%)`,
      }}
    />
  )
}

export function LandingPage() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // 0 → top of page, 1 → hero fully scrolled past. Drives the 3D phone and fades it out
  // before the content sections so the rest of the page reads on a solid background.
  const { scrollYProgress: sceneProgress } = useScroll({
    target: sceneRef,
    offset: ['start start', 'end start'],
  })
  const canvasOpacity = useTransform(sceneProgress, [0, 0.75, 1], [1, 1, 0])

  return (
    <div className="min-h-screen" style={{ backgroundColor: LANDING_COLORS.ink }}>
      <style>{MARQUEE_KEYFRAMES}</style>
      <ScrollProgressBar />
      <GrainOverlay />
      <LandingNav />

      {/* Immersive scene: fixed 3D canvas behind the hero only */}
      <div ref={sceneRef} className="relative">
        <motion.div className="fixed inset-0 z-0" style={{ opacity: canvasOpacity }} aria-hidden>
          {shouldReduceMotion ? (
            <StaticSceneFallback />
          ) : (
            <SceneErrorBoundary fallback={<StaticSceneFallback />}>
              <HeroCanvas progress={sceneProgress} />
            </SceneErrorBoundary>
          )}
          {/* Ambient glow behind the phone */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ backgroundColor: `${LANDING_COLORS.brand}14` }}
          />
        </motion.div>

        <div className="relative z-10">
          <LandingHero />
        </div>
      </div>

      <FeatureMarquee />
      <ProblemSection />
      <CapabilitiesSection />
      <HowItWorksSection />
      <FeatureJourney />
      <StatsBand />
      <SocialProofSection />
      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <LandingFooter />
    </div>
  )
}
