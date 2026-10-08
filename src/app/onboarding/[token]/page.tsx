import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import type { OnboardingView } from '@/lib/onboarding/view'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { SMARTMENU } from '@/components/landing/landing-theme'
import { landingFontClass } from '@/components/landing/landing-fonts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up your store | SmartMenu',
  // A private, token-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const HELP_URL = 'https://m.me/WebNegosyoOfficial'

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-extrabold" style={{ color: SMARTMENU.ink }}>{title}</h1>
      <p className="mt-2 text-sm" style={{ color: SMARTMENU.cocoa }}>{body}</p>
    </div>
  )
}

function InvalidLink() {
  return (
    <Notice
      title="This set-up link is not valid"
      body="It may have been replaced by a newer link. Message us on Facebook and we will send you a fresh one."
    />
  )
}

function Unavailable() {
  return (
    <Notice
      title="We could not open your set-up just now"
      body="Your link is fine. Please refresh this page in a minute — nothing you entered is lost."
    />
  )
}

type PageState = { kind: 'ready'; view: OnboardingView } | { kind: 'invalid' } | { kind: 'unavailable' }

/** A bad token reads as "not valid"; a failed read must not, or a buyer asks for a new link that kills theirs. */
async function loadPageState(token: string): Promise<PageState> {
  try {
    const admin = createAdminClient()
    const onboarding = await findOnboardingForToken(admin, token)
    if (!onboarding) return { kind: 'invalid' }
    return { kind: 'ready', view: await loadOnboardingView(admin, onboarding) }
  } catch (error) {
    console.error('[onboarding] set-up page read failed', error instanceof Error ? error.message : error)
    return { kind: 'unavailable' }
  }
}

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const state = await loadPageState(token)

  return (
    <main
      className={`${landingFontClass} min-h-screen px-4 pb-16 pt-5 sm:px-6`}
      style={{ backgroundColor: SMARTMENU.cream, fontFamily: 'var(--font-landing-text), system-ui, sans-serif' }}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between sm:mb-12">
          <div className="flex items-center gap-2.5">
            <Image src="/smartmenu-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
            <span className="text-base font-extrabold tracking-tight" style={{ color: SMARTMENU.ink, fontFamily: 'var(--font-landing-display), system-ui' }}>
              SmartMenu
            </span>
          </div>
          <a
            href={HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold transition hover:bg-black/[0.03]"
            style={{ color: SMARTMENU.ink }}
          >
            Need help? Message us
          </a>
        </header>
        {state.kind === 'ready' && <OnboardingFlow token={token} initialView={state.view} />}
        {state.kind === 'invalid' && <InvalidLink />}
        {state.kind === 'unavailable' && <Unavailable />}
      </div>
    </main>
  )
}
