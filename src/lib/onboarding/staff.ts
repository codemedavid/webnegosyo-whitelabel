/**
 * Staff view of a lead's store set-up, for the checkout-leads console.
 * Callers MUST have checked the platform permission first.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingByLead, type OnboardingStatus } from './repository'
import { confirmLeadPayment, publishStore } from './launch'
import { displayedBuildStatus } from './build-staleness'

export interface LeadOnboardingSummary {
  status: OnboardingStatus
  error: string | null
  attempts: number
  isLaunchRequested: boolean
  store: { name: string; slug: string; isLive: boolean } | null
}

export async function readLeadOnboarding(leadId: string): Promise<LeadOnboardingSummary | null> {
  const admin = createAdminClient()
  const onboarding = await findOnboardingByLead(admin, leadId)
  if (!onboarding) return null

  const { data: tenant } = onboarding.tenantId
    ? await admin.from('tenants').select('name, slug, is_prelaunch').eq('id', onboarding.tenantId).maybeSingle()
    : { data: null }
  const row = tenant as { name: string; slug: string; is_prelaunch: boolean } | null

  return {
    // A build that died mid-run reads as failed, so staff get the retry button.
    status: displayedBuildStatus(onboarding),
    error: onboarding.error,
    attempts: onboarding.attempts,
    isLaunchRequested: !!onboarding.launchRequestedAt,
    store: row ? { name: row.name, slug: row.slug, isLive: !row.is_prelaunch } : null,
  }
}

/**
 * The console's status dropdown, made launch-aware: "paid" confirms the
 * payment (opening the store when its owner already asked), "live" opens the
 * linked store as a staff override. Other statuses are plain label changes.
 */
export async function applyLeadStatusWithLaunch(leadId: string, status: string): Promise<{ handled: boolean; isPublished: boolean }> {
  if (status === 'paid') {
    const { isPublished } = await confirmLeadPayment(createAdminClient(), leadId)
    return { handled: true, isPublished }
  }
  if (status === 'live') {
    const admin = createAdminClient()
    const onboarding = await findOnboardingByLead(admin, leadId)
    if (!onboarding?.tenantId) return { handled: false, isPublished: false }
    await publishStore(admin, onboarding.tenantId, leadId)
    return { handled: true, isPublished: true }
  }
  return { handled: false, isPublished: false }
}
