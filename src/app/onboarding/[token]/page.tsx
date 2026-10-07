import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import type { OnboardingView } from '@/lib/onboarding/view'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { SMARTMENU } from '@/components/landing/landing-theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up your store | SmartMenu',
  // A private, token-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
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
    <main className="min-h-screen px-4 pb-16 pt-6" style={{ backgroundColor: SMARTMENU.cream }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/smartmenu-mark.png" alt="SmartMenu" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-sm font-extrabold tracking-tight" style={{ color: SMARTMENU.ink }}>SmartMenu set-up</span>
        </div>
        {state.kind === 'ready' && <OnboardingFlow token={token} initialView={state.view} />}
        {state.kind === 'invalid' && <InvalidLink />}
        {state.kind === 'unavailable' && <Unavailable />}
      </div>
    </main>
  )
}
