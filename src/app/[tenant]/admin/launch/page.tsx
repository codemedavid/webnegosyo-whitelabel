import { notFound, redirect } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { findOnboardingByTenant } from '@/lib/onboarding/repository'
import { loadLaunchSnapshot } from '@/lib/onboarding/launch-snapshot'
import { buildLaunchReadiness } from '@/lib/onboarding/readiness'
import { LaunchChecklist } from '@/components/admin/launch/launch-checklist'
import { loadFirstWeekPlan } from '@/lib/onboarding/first-week-data'
import { resolvePlatformOrigin } from '@/lib/onboarding/first-week'
import { FirstWeekPlan } from '@/components/onboarding/first-week-plan'
import { hasStartHere } from '@/lib/onboarding/start-here-eligibility'

interface LaunchPageProps {
  params: Promise<{ tenant: string }>
}

async function readLeadStatus(leadId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('checkout_leads').select('status').eq('id', leadId).maybeSingle()
  return (data as { status: string } | null)?.status ?? null
}

/**
 * The launch checklist: what the automated set-up built, what is still
 * missing, and the owner's "Launch my store" button. Reads run on the service
 * role only after the caller is verified as an admin of this store.
 */
export default async function LaunchPage({ params }: LaunchPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()
  await verifyTenantAdmin(tenant.id, 'view')
  // Onboarded stores in their first weeks have one place for all of this: Start here.
  if (await hasStartHere(tenant.id)) redirect(`/${tenantSlug}/admin/start${tenant.is_prelaunch === true ? '#launch' : ''}`)

  const admin = createAdminClient()
  const [snapshot, onboarding, firstWeek] = await Promise.all([
    loadLaunchSnapshot(admin, tenant),
    findOnboardingByTenant(admin, tenant.id),
    // The admin may be served on the store's own domain, where /university does not exist.
    loadFirstWeekPlan(tenantSlug, resolvePlatformOrigin()),
  ])
  const leadStatus = onboarding ? await readLeadStatus(onboarding.checkoutLeadId) : null
  const isPrelaunch = tenant.is_prelaunch === true

  return (
    <div className="space-y-6">
      <LaunchChecklist
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        readiness={buildLaunchReadiness(snapshot)}
        summary={onboarding?.summary ?? null}
        isLive={!isPrelaunch}
        isLaunchRequested={!!onboarding?.launchRequestedAt}
        isPaymentConfirmed={leadStatus === 'paid' || leadStatus === 'live'}
      />
      <div className="mx-auto max-w-3xl">
        <FirstWeekPlan plan={firstWeek} storeSlug={tenantSlug} />
      </div>
    </div>
  )
}
