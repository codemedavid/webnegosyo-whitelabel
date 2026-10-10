import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingForToken } from '@/lib/onboarding/access'
import { hashInviteCode, isWellFormedInviteCode } from '@/lib/onboarding/invites/code'
import { findInviteByHash } from '@/lib/onboarding/invites/repository'
import { JOIN_RESUME_COOKIE, joinPageState, type JoinPageState, type ResumeCandidate } from '@/lib/onboarding/invites/resume'
import { OnboardingNotice, OnboardingShell } from '@/components/onboarding/onboarding-page-chrome'
import { JoinForm } from '@/components/onboarding/join-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign up | SmartMenu',
  // A private, code-addressed page: never indexed, never sent as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type PageState = JoinPageState | { kind: 'invalid' } | { kind: 'unavailable' }

const NOTICES: Record<Exclude<PageState['kind'], 'form' | 'resume'>, { title: string; body: string }> = {
  invalid: { title: 'This sign-up link is not valid', body: 'Check that you copied the whole link, or message us and we will send you a new one.' },
  used: { title: 'This sign-up link was already used', body: 'Each link works once. If you started your set-up on another phone, open it there — or message us and we will send your set-up link.' },
  revoked: { title: 'This sign-up link was turned off', body: 'Message us and we will send you a new one.' },
  expired: { title: 'This sign-up link has expired', body: 'Message us and we will send you a new one.' },
  unavailable: { title: 'We could not open this link just now', body: 'Your link is fine. Refresh this page in a minute.' },
}

async function readResumeCandidate(admin: ReturnType<typeof createAdminClient>): Promise<ResumeCandidate | null> {
  const token = (await cookies()).get(JOIN_RESUME_COOKIE)?.value
  if (!token) return null
  const onboarding = await findOnboardingForToken(admin, token)
  return onboarding ? { token, checkoutLeadId: onboarding.checkoutLeadId } : null
}

async function loadPageState(code: string): Promise<PageState> {
  if (!isWellFormedInviteCode(code)) return { kind: 'invalid' }
  try {
    const admin = createAdminClient()
    const invite = await findInviteByHash(admin, hashInviteCode(code))
    if (!invite) return { kind: 'invalid' }
    const resume = invite.claimedAt ? await readResumeCandidate(admin) : null
    return joinPageState(invite, resume)
  } catch (error) {
    console.error('[signup-link] join page read failed', error instanceof Error ? error.message : error)
    return { kind: 'unavailable' }
  }
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const state = await loadPageState(code)
  if (state.kind === 'resume') redirect(`/onboarding/${state.token}`)

  return (
    <OnboardingShell>
      {state.kind === 'form' ? <JoinForm code={code} /> : <OnboardingNotice {...NOTICES[state.kind]} />}
    </OnboardingShell>
  )
}
