'use client'

import { Check } from 'lucide-react'
import { Owl, type OwlLook, type OwlState } from '@/components/mascot/owl'
import { OB } from './onboarding-ui'

/*
 * The first screen is Owl's: one greeting, one line, one button. He rises out
 * of an ink stage that runs off the bottom of the screen, and the wizard's
 * bar floats its Let's go button over his belly (the character IS the screen,
 * like the best character-led onboardings). Everything else waits for the
 * step that needs it.
 */

interface WelcomeHeroProps {
  firstName: string
  businessName: string
  isPaid: boolean
  owlState: OwlState
  owlLook?: OwlLook
  /** A problem to show under the greeting (e.g. the set-up link could not be read). */
  children?: React.ReactNode
}

/** The stage colour: warm ink, so his red reads at full strength. */
const WELCOME_STAGE = OB.ink

/** Rendered big enough to keep his soft shading; CSS sizes him to the screen. */
const HERO_OWL_PX = 368

export function WelcomeHero({ firstName, businessName, isPaid, owlState, owlLook, children }: WelcomeHeroProps) {
  const greeting = firstName ? `Mabuhay, ${firstName}!` : 'Mabuhay!'
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <div className="relative z-20 mx-auto w-full max-w-[36rem] px-5 pt-4 text-center sm:px-8 sm:pt-8">
        {isPaid && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={{ backgroundColor: OB.wash, color: OB.ink }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white" aria-hidden><Check className="h-3 w-3" strokeWidth={3.5} /></span>
            Payment received. Salamat!
          </p>
        )}
        <h1 tabIndex={-1} className="text-balance text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.04em] outline-none sm:text-[3.5rem]" style={{ color: OB.ink }}>
          {greeting}
          <span className="mt-1 block text-[1.625rem] leading-[1.12] tracking-[-0.03em] sm:text-[2.25rem]">
            Tara, buksan natin ang {businessName || 'store n\'yo'}.
          </span>
        </h1>
        <p className="mt-4 text-[17px] font-semibold" style={{ color: OB.muted }}>About 5 minutes, mostly taps.</p>
        <p className="mx-auto mt-1.5 max-w-[24rem] text-pretty text-[14px] leading-relaxed [@media(max-height:680px)]:hidden" style={{ color: OB.faint }}>
          Have ready: a photo of your menu, your logo if you have one, and your GCash or Maya number.
        </p>
        {children && <div className="mt-5 text-left">{children}</div>}
      </div>

      <div className="relative mt-auto flex justify-center pt-6">
        <div className="relative">
          {/* The stage crosses him at the head and runs off the bottom of the screen. */}
          <div aria-hidden className="absolute -bottom-40 left-1/2 top-[30%] w-[100vw] -translate-x-1/2 rounded-t-[2.75rem] sm:rounded-t-[4rem]" style={{ backgroundColor: WELCOME_STAGE }} />
          {/* Sized by the height left under the greeting; his feet sink under the button bar. */}
          <Owl
            state={owlState}
            look={owlLook}
            size={HERO_OWL_PX}
            className="relative z-10 h-[clamp(13rem,calc(100dvh-21rem),30rem)] w-auto translate-y-[11%]"
          />
        </div>
      </div>
    </section>
  )
}
