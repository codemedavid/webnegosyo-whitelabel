import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import type { OnboardingView } from '@/lib/onboarding/view'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { landingFontClass } from '@/components/landing/landing-fonts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up your store | SmartMenu',
  // A private, token-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const HELP_URL = 'https://m.me/WebNegosyoOfficial'
const INK = '#17130F'
const MUTED = '#5C544D'

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-balance text-2xl font-extrabold tracking-[-0.02em]" style={{ color: INK }}>{title}</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>{body}</p>
      <a href={HELP_URL} target="_blank" rel="noopener noreferrer"
        className="mt-8 inline-flex min-h-12 items-center rounded-xl px-6 text-[15px] font-semibold text-white" style={{ backgroundColor: INK }}>
        Message us on Facebook
      </a>
    </div>
  )
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
    <main className={`${landingFontClass} min-h-dvh bg-white antialiased`} style={{ fontFamily: 'var(--font-landing-text), system-ui, sans-serif', color: INK }}>
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <span className="flex items-center gap-2">
          <Image src="/smartmenu-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-[17px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-landing-display), system-ui' }}>SmartMenu</span>
        </span>
        <a
          href={HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#F6F4F1]"
          style={{ borderColor: '#E9E5E0' }}
        >
          Questions?
        </a>
      </header>
      {state.kind === 'ready' && <OnboardingFlow token={token} initialView={state.view} />}
      {state.kind === 'invalid' && <InvalidLink />}
      {state.kind === 'unavailable' && <Unavailable />}
    </main>
  )
}
