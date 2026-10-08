/**
 * Token → onboarding, plus the view the buyer is allowed to see. Server-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hashOnboardingToken, isWellFormedOnboardingToken } from './token'
import { findOnboardingByTokenHash, type StoreOnboarding } from './repository'
import { buildOnboardingView, type OnboardingView } from './view'
import { loadFirstWeekPlan } from './first-week-data'
import { loadLaunchSnapshot, type LaunchTenantFields } from './launch-snapshot'
import { buildLaunchReadiness, type LaunchReadiness } from './readiness'

type AdminClient = SupabaseClient<Database>

export async function findOnboardingForToken(admin: AdminClient, token: unknown): Promise<StoreOnboarding | null> {
  if (!isWellFormedOnboardingToken(token)) return null
  return findOnboardingByTokenHash(admin, hashOnboardingToken(token))
}

export async function loadOnboardingView(admin: AdminClient, onboarding: StoreOnboarding): Promise<OnboardingView> {
  const [leadResult, tenantResult] = await Promise.all([
    admin.from('checkout_leads').select('business_name, email, status, name').eq('id', onboarding.checkoutLeadId).single(),
    onboarding.tenantId
      ? admin.from('tenants').select('id, name, slug, is_prelaunch, logo_url, messenger_page_id, messenger_username, facebook_page_id, operating_hours, loyalty_enabled, loyalty_shadow').eq('id', onboarding.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (leadResult.error || !leadResult.data) throw new Error('The order for this set-up could not be read.')

  const lead = leadResult.data as { business_name: string; email: string; status: string; name: string | null }
  const tenant = (tenantResult.data as (LaunchTenantFields & { name: string; slug: string; is_prelaunch: boolean }) | null) ?? null
  const view = buildOnboardingView({ onboarding, lead, tenant })
  if (!view.store || !tenant) return view
  // Lessons fill the wait while the store builds (a cached read, cheap to poll).
  // The wizard is served on the platform host, so University links stay relative.
  const firstWeek = await loadFirstWeekPlan(view.store.slug, '')
  // The checklist (six counts) only matters once the build has stopped.
  const isBuilding = view.status === 'queued' || view.status === 'running'
  if (isBuilding) return { ...view, firstWeek }
  const readiness = await readReadiness(admin, tenant)
  return { ...buildOnboardingView({ onboarding, lead, tenant, readiness }), firstWeek }
}

/** A failed checklist read hides "Go live" (null) instead of failing the page. */
async function readReadiness(admin: AdminClient, tenant: LaunchTenantFields): Promise<LaunchReadiness | null> {
  try {
    return buildLaunchReadiness(await loadLaunchSnapshot(admin, tenant))
  } catch (error) {
    console.error('[onboarding] launch checklist read failed', error instanceof Error ? error.message : error)
    return null
  }
}
