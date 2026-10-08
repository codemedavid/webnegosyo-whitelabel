/**
 * "Go live" pressed on the set-up page itself. The set-up link is the only
 * credential there (a 256-bit secret sent after payment), so every rule the
 * owner's dashboard launch applies is re-checked here: the build has stopped,
 * the payment is confirmed, and nothing blocks a checkout.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { displayedBuildStatus } from './build-staleness'
import { decideBuyerLaunch, requestStoreLaunch } from './launch'
import { loadLaunchSnapshot, type LaunchTenantFields } from './launch-snapshot'
import { buildLaunchReadiness } from './readiness'
import type { StoreOnboarding } from './repository'

type AdminClient = SupabaseClient<Database>

export type BuyerLaunchResult = { ok: true } | { ok: false; status: number; error: string }

/** Only what the launch checklist reads, plus the pre-launch flag. */
const LAUNCH_TENANT_COLUMNS =
  'id, is_prelaunch, logo_url, messenger_page_id, messenger_username, facebook_page_id, operating_hours, loyalty_enabled, loyalty_shadow'

const REFUSAL_STATUS = { no_store: 409, building: 409, not_paid: 402, blocked: 409 } as const

async function readLaunchInputs(admin: AdminClient, onboarding: StoreOnboarding, tenantId: string) {
  const [tenantResult, leadResult] = await Promise.all([
    admin.from('tenants').select(LAUNCH_TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
    admin.from('checkout_leads').select('status').eq('id', onboarding.checkoutLeadId).maybeSingle(),
  ])
  if (tenantResult.error) throw new Error(`Store could not be read: ${tenantResult.error.message}`)
  if (leadResult.error) throw new Error(`Order could not be read: ${leadResult.error.message}`)
  const tenant = tenantResult.data as (LaunchTenantFields & { is_prelaunch?: boolean | null }) | null
  return { tenant, leadStatus: (leadResult.data as { status: string } | null)?.status ?? null }
}

export async function launchFromSetupLink(admin: AdminClient, onboarding: StoreOnboarding): Promise<BuyerLaunchResult> {
  const status = displayedBuildStatus(onboarding)
  const isBuilding = status === 'queued' || status === 'running'
  if (!onboarding.tenantId) {
    return { ok: false, status: REFUSAL_STATUS.no_store, error: 'Your store is not created yet.' }
  }

  const { tenant, leadStatus } = await readLaunchInputs(admin, onboarding, onboarding.tenantId)
  const readiness = tenant ? buildLaunchReadiness(await loadLaunchSnapshot(admin, tenant)) : null
  const decision = decideBuyerLaunch({
    hasStore: !!tenant,
    isBuilding,
    isLive: tenant?.is_prelaunch === false,
    leadStatus,
    blockers: readiness?.blockers.map((item) => item.label) ?? [],
  })
  if (!decision.ok) return { ok: false, status: REFUSAL_STATUS[decision.reason], error: decision.message }
  if (decision.isAlreadyLive) return { ok: true }

  const outcome = await requestStoreLaunch(admin, onboarding.tenantId)
  return outcome === 'live'
    ? { ok: true }
    : { ok: false, status: 402, error: 'Your store opens as soon as we confirm your payment.' }
}
