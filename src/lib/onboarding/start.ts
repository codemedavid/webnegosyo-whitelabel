/**
 * Open a set-up wizard for a fresh checkout lead. Returns the plain token
 * exactly once (only its hash is stored); null when the wizard could not be
 * opened — the lead itself is already saved, so the buyer is never failed for
 * it, and staff can issue a link from the lead later.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createOnboardingToken } from './token'
import { createOnboarding, findOnboardingByLead, rotateOnboardingToken } from './repository'

export async function startStoreOnboarding(leadId: string): Promise<string | null> {
  try {
    const { token, hash } = createOnboardingToken()
    await createOnboarding(createAdminClient(), leadId, hash)
    return token
  } catch (error) {
    console.error('[onboarding] set-up wizard could not be opened', {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * A new link for a lead (lost link, or a lead from before onboarding existed).
 * The previous link stops working.
 */
export async function issueOnboardingLink(leadId: string): Promise<string> {
  const admin = createAdminClient()
  const { token, hash } = createOnboardingToken()
  const existing = await findOnboardingByLead(admin, leadId)
  if (existing) {
    await rotateOnboardingToken(admin, existing.id, hash)
  } else {
    await createOnboarding(admin, leadId, hash)
  }
  return token
}
