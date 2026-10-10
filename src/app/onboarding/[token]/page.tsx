import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import type { OnboardingView } from '@/lib/onboarding/view'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { OnboardingNotice as Notice, OnboardingShell } from '@/components/onboarding/onboarding-page-chrome'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up your store | SmartMenu',
  // A private, token-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

function InvalidLink() {
  return (
    <Notice
      title="This set-up link is not valid"
      body="It may have been replaced by a newer link. Message us and we will send you a fresh one."
    />
  )
}

function Unavailable() {
  return (
    <Notice
      title="We could not open your set-up just now"
      body="Your link is fine. Refresh this page in a minute. Nothing you entered is lost."
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
    <OnboardingShell>
      {state.kind === 'ready' && <OnboardingFlow token={token} initialView={state.view} />}
      {state.kind === 'invalid' && <InvalidLink />}
      {state.kind === 'unavailable' && <Unavailable />}
    </OnboardingShell>
  )
}
