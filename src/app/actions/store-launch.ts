'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantOwner } from '@/lib/admin-service'
import { requestStoreLaunch, type LaunchOutcome } from '@/lib/onboarding/launch'
import { loadLaunchSnapshot } from '@/lib/onboarding/launch-snapshot'
import { buildLaunchReadiness } from '@/lib/onboarding/readiness'

export type StoreLaunchResult = { success: true; outcome: LaunchOutcome } | { success: false; error: string }

/**
 * The owner's "Launch my store". Refused while a launch blocker remains (no
 * menu, no way to pay, no way to order). Opens the store at once when the
 * payment is already confirmed; otherwise records the request and the store
 * opens the moment staff confirm the payment.
 */
export async function requestStoreLaunchAction(tenantId: string, tenantSlug: string): Promise<StoreLaunchResult> {
  try {
    await verifyTenantOwner(tenantId)
    const admin = createAdminClient()

    const { data: tenant, error } = await admin.from('tenants').select('*').eq('id', tenantId).single()
    if (error || !tenant) return { success: false, error: 'Store not found.' }

    const readiness = buildLaunchReadiness(await loadLaunchSnapshot(admin, tenant))
    if (!readiness.canLaunch) {
      return { success: false, error: `Finish these first: ${readiness.blockers.map((item) => item.label).join(', ')}.` }
    }

    const outcome = await requestStoreLaunch(admin, tenantId)
    revalidatePath(`/${tenantSlug}/admin/launch`)
    revalidatePath(`/${tenantSlug}/admin/start`)
    return { success: true, outcome }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Launch failed.'
    console.error('[store-launch] request failed', { tenantId, message })
    return { success: false, error: message.startsWith('Unauthorized') ? 'Only the store owner can launch the store.' : 'Launch failed. Please try again.' }
  }
}
