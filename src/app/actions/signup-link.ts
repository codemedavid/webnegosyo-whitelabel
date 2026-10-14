'use server'

/**
 * A customer using a sign-up link (`/onboarding/join/<code>`). Public: the
 * code is the credential. Staff side: `./onboarding-invites.ts`.
 */

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import { createPaidCheckoutLead } from '@/lib/checkout-leads/checkout-leads-service'
import { startStoreOnboarding } from '@/lib/onboarding/start'
import { hashInviteCode, isWellFormedInviteCode } from '@/lib/onboarding/invites/code'
import { joinFormSchema, type JoinFormInput, type JoinRefusalField } from '@/lib/onboarding/invites/schema'
import { redeemInvite, type RedeemDeps, type RedeemResult } from '@/lib/onboarding/invites/redeem'
import { JOIN_RESUME_COOKIE, JOIN_RESUME_MAX_AGE_SEC, joinCookiePath } from '@/lib/onboarding/invites/resume'
import { attachInviteLead, claimInvite, isEmailTaken, releaseInvite } from '@/lib/onboarding/invites/repository'

/** Tries per client IP: enough for typos, too few to sweep codes or emails. */
const SIGNUP_LINK_RATE_LIMIT = { limit: 10, windowSec: 600 }

const REFUSALS: Record<Exclude<RedeemResult['kind'], 'started'>, string> = {
  email_taken: 'This email already has a WebNegosyo login. Use another email, or message us and we will attach your new store to it.',
  unavailable: 'This link was already used or is no longer valid. Message us and we will send you a new one.',
  failed: 'We could not save your details. Please try again.',
  saved_without_link: 'Your details are saved, but we could not open your set-up just now. Message us and we will send your set-up link.',
}

function redeemDeps(): RedeemDeps {
  const admin = createAdminClient()
  return {
    isEmailTaken: (email) => isEmailTaken(admin, email),
    claimInvite: (codeHash) => claimInvite(admin, codeHash),
    releaseInvite: (inviteId) => releaseInvite(admin, inviteId),
    createPaidLead: async (input) => (await createPaidCheckoutLead(input)).data,
    attachLead: (inviteId, leadId) => attachInviteLead(admin, inviteId, leadId),
    startOnboarding: startStoreOnboarding,
  }
}

type RedeemActionResult = { path: string; error: null } | { path: null; error: string; field: JoinRefusalField }

const JOIN_FIELDS: ReadonlySet<string> = new Set(Object.keys(joinFormSchema.shape))

function refusal(error: string, field: JoinRefusalField = null): RedeemActionResult {
  return { path: null, error, field }
}

function fieldOfIssue(path: readonly PropertyKey[] | undefined): JoinRefusalField {
  const key = path?.[0]
  return typeof key === 'string' && JOIN_FIELDS.has(key) ? (key as keyof JoinFormInput) : null
}

export async function redeemSignupLinkAction(code: unknown, form: unknown): Promise<RedeemActionResult> {
  if (!isWellFormedInviteCode(code)) return refusal(REFUSALS.unavailable)
  const parsed = joinFormSchema.safeParse(form)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return refusal(issue?.message ?? 'Check your details.', fieldOfIssue(issue?.path))
  }

  const rate = await checkActionRateLimit('signup-link', { ...SIGNUP_LINK_RATE_LIMIT, onRedisFailure: 'instance' })
  if (!rate.allowed) return refusal(`Too many tries. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s) and try again.`)

  let result: RedeemResult
  try {
    result = await redeemInvite(hashInviteCode(code), parsed.data, redeemDeps())
  } catch (error) {
    console.error('[signup-link] redeem failed', error instanceof Error ? error.message : error)
    return refusal(REFUSALS.failed)
  }
  if (result.kind !== 'started') return refusal(REFUSALS[result.kind], result.kind === 'email_taken' ? 'email' : null)

  // This browser can come back to its wizard through the (now used) link.
  ;(await cookies()).set(JOIN_RESUME_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: joinCookiePath(code),
    maxAge: JOIN_RESUME_MAX_AGE_SEC,
  })
  return { path: `/onboarding/${result.token}`, error: null }
}
