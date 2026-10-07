/**
 * Token → onboarding, plus the view the buyer is allowed to see. Server-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hashOnboardingToken, isWellFormedOnboardingToken } from './token'
import { findOnboardingByTokenHash, type StoreOnboarding } from './repository'
import { buildOnboardingView, type OnboardingView } from './view'
import { loadFirstWeekPlan } from './first-week-data'

type AdminClient = SupabaseClient<Database>

export async function findOnboardingForToken(admin: AdminClient, token: unknown): Promise<StoreOnboarding | null> {
  if (!isWellFormedOnboardingToken(token)) return null
  return findOnboardingByTokenHash(admin, hashOnboardingToken(token))
}

export async function loadOnboardingView(admin: AdminClient, onboarding: StoreOnboarding): Promise<OnboardingView> {
  const [leadResult, tenantResult] = await Promise.all([
    admin.from('checkout_leads').select('business_name, email, status').eq('id', onboarding.checkoutLeadId).single(),
    onboarding.tenantId
      ? admin.from('tenants').select('name, slug, is_prelaunch').eq('id', onboarding.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (leadResult.error || !leadResult.data) throw new Error('The order for this set-up could not be read.')

  const view = buildOnboardingView({
    onboarding,
    lead: leadResult.data as { business_name: string; email: string; status: string },
    tenant: (tenantResult.data as { name: string; slug: string; is_prelaunch: boolean } | null) ?? null,
  })
  // The plan only matters once the build has stopped; skip the read while it polls.
  const isBuilding = view.status === 'queued' || view.status === 'running'
  if (!view.store || isBuilding) return view
  // The wizard is served on the platform host, so University links stay relative.
  return { ...view, firstWeek: await loadFirstWeekPlan(view.store.slug, '') }
}
