import type { Metadata } from 'next'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken, loadOnboardingView } from '@/lib/onboarding/access'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { SMARTMENU } from '@/components/landing/landing-theme'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Set up your store | SmartMenu',
  // A private, token-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

function InvalidLink() {
  return (
    <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-extrabold" style={{ color: SMARTMENU.ink }}>This set-up link is not valid</h1>
      <p className="mt-2 text-sm" style={{ color: SMARTMENU.cocoa }}>
        It may have been replaced by a newer link. Message us on Facebook and we will send you a fresh one.
      </p>
    </div>
  )
}

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const onboarding = await findOnboardingForToken(admin, token).catch(() => null)
  const view = onboarding ? await loadOnboardingView(admin, onboarding).catch(() => null) : null

  return (
    <main className="min-h-screen px-4 pb-16 pt-6" style={{ backgroundColor: SMARTMENU.cream }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/smartmenu-mark.png" alt="SmartMenu" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-sm font-extrabold tracking-tight" style={{ color: SMARTMENU.ink }}>SmartMenu set-up</span>
        </div>
        {view ? <OnboardingFlow token={token} initialView={view} /> : <InvalidLink />}
      </div>
    </main>
  )
}
