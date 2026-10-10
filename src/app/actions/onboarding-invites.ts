'use server'

/**
 * Staff side of sign-up links (Superadmin → Checkout Leads → Sign-up links).
 * The customer side is `./signup-link.ts`.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import { createInviteCode } from '@/lib/onboarding/invites/code'
import { createInviteSchema } from '@/lib/onboarding/invites/schema'
import { inviteExpiryFrom } from '@/lib/onboarding/invites/status'
import { joinCookiePath } from '@/lib/onboarding/invites/resume'
import { insertInvite, listInvites, revokeInvite, type OnboardingInvite } from '@/lib/onboarding/invites/repository'

const inviteIdSchema = z.string().uuid()

export async function listOnboardingInvitesAction(): Promise<{ invites: OnboardingInvite[]; error: string | null }> {
  await requirePlatformPermission('checkout_leads.view')
  try {
    return { invites: await listInvites(createAdminClient()), error: null }
  } catch (error) {
    console.error('[onboarding-invites] list failed', error instanceof Error ? error.message : error)
    return { invites: [], error: 'Could not load the sign-up links.' }
  }
}

/** The link's path is returned ONCE — only its hash is stored. */
export async function createOnboardingInviteAction(
  input: unknown,
): Promise<{ path: string; invite: OnboardingInvite; error: null } | { path: null; invite: null; error: string }> {
  const caller = await requirePlatformPermission('checkout_leads.edit')
  const parsed = createInviteSchema.safeParse(input)
  if (!parsed.success) return { path: null, invite: null, error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  const { code, hash } = createInviteCode()
  try {
    const invite = await insertInvite(createAdminClient(), {
      codeHash: hash,
      label: parsed.data.label,
      paymentTerm: parsed.data.payment_term,
      notes: parsed.data.notes || null,
      expiresAt: inviteExpiryFrom(Date.now(), parsed.data.expires_in_days),
      createdBy: caller.user.id,
    })
    return { path: joinCookiePath(code), invite, error: null }
  } catch (error) {
    console.error('[onboarding-invites] create failed', error instanceof Error ? error.message : error)
    return { path: null, invite: null, error: 'Could not create the link. Please try again.' }
  }
}

export async function revokeOnboardingInviteAction(inviteId: unknown): Promise<{ error: string | null }> {
  await requirePlatformPermission('checkout_leads.edit')
  const parsed = inviteIdSchema.safeParse(inviteId)
  if (!parsed.success) return { error: 'Unknown link.' }
  try {
    const isRevoked = await revokeInvite(createAdminClient(), parsed.data)
    return { error: isRevoked ? null : 'This link was already used or turned off.' }
  } catch (error) {
    console.error('[onboarding-invites] revoke failed', error instanceof Error ? error.message : error)
    return { error: 'Could not turn the link off. Please try again.' }
  }
}
