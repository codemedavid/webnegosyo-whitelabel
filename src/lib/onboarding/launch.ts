/**
 * Opening an onboarded store to customers.
 *
 * Two people must both say yes, in either order:
 *  - the OWNER presses "Launch my store" (they have reviewed it), and
 *  - the PLATFORM confirms the ₱999 payment.
 * Whichever comes second opens the store. Neither alone can: a merchant cannot
 * take orders before paying, and staff never open a store its owner has not
 * reviewed. `is_prelaunch` is a privileged column, so this is the only path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { invalidateTenantCache } from '@/lib/cache'
import { findOnboardingByLead, findOnboardingByTenant, markLaunchRequested } from './repository'
import { isPaidLeadStatus } from './lead-status'

export { isPaidLeadStatus }

type AdminClient = SupabaseClient<Database>

export type LaunchOutcome = 'live' | 'awaiting_payment'

/** Pure: may the store open now? */
export function decideLaunch(input: { isLaunchRequested: boolean; leadStatus: string | null }): boolean {
  return input.isLaunchRequested && isPaidLeadStatus(input.leadStatus)
}

export type BuyerLaunchRefusal = 'no_store' | 'building' | 'not_paid' | 'blocked'

export type BuyerLaunchDecision =
  | { ok: true; isAlreadyLive?: true }
  | { ok: false; reason: BuyerLaunchRefusal; message: string }

/**
 * Pure: may the buyer's "Go live" on the set-up page open the store? The link
 * is sent only after payment, so the owner's tap is the second key — but the
 * lead is still re-checked here, because older links went out before payment.
 */
export function decideBuyerLaunch(input: {
  hasStore: boolean
  isBuilding: boolean
  isLive: boolean
  leadStatus: string | null
  blockers: readonly string[]
}): BuyerLaunchDecision {
  if (!input.hasStore) return { ok: false, reason: 'no_store', message: 'Your store is not created yet.' }
  if (input.isLive) return { ok: true, isAlreadyLive: true }
  if (input.isBuilding) return { ok: false, reason: 'building', message: 'Your store is still being built. One moment.' }
  if (!isPaidLeadStatus(input.leadStatus)) {
    return { ok: false, reason: 'not_paid', message: 'Your store opens as soon as we confirm your payment.' }
  }
  if (input.blockers.length > 0) {
    return { ok: false, reason: 'blocked', message: `Finish these first: ${input.blockers.join(', ')}.` }
  }
  return { ok: true }
}

async function readLeadStatus(admin: AdminClient, leadId: string): Promise<string | null> {
  const { data, error } = await admin.from('checkout_leads').select('status').eq('id', leadId).maybeSingle()
  if (error) throw new Error(`The order could not be read: ${error.message}`)
  return (data as { status: string } | null)?.status ?? null
}

/** Flip the store live, mark the lead live, refresh every cached storefront read. */
export async function publishStore(admin: AdminClient, tenantId: string, leadId: string): Promise<void> {
  const { data, error } = await admin
    .from('tenants')
    .update({ is_prelaunch: false } as never)
    .eq('id', tenantId)
    .select('slug')
  if (error || !data?.length) throw new Error(`The store could not be opened: ${error?.message ?? 'not found'}`)

  const { error: leadError } = await admin
    .from('checkout_leads')
    .update({ status: 'live', updated_at: new Date().toISOString() } as never)
    .eq('id', leadId)
  if (leadError) console.error('[onboarding] store opened but lead not marked live', { leadId, error: leadError.message })

  const slug = (data[0] as { slug: string }).slug
  await invalidateTenantCache(slug, tenantId).catch((cacheError: unknown) => {
    console.warn('[onboarding] store opened; cache refresh failed', cacheError)
  })
}

/** The owner's "Launch my store". Opens it now when the payment is already confirmed. */
export async function requestStoreLaunch(admin: AdminClient, tenantId: string): Promise<LaunchOutcome> {
  const onboarding = await findOnboardingByTenant(admin, tenantId)
  if (!onboarding) throw new Error('This store has no launch to request.')

  await markLaunchRequested(admin, onboarding.id)
  const leadStatus = await readLeadStatus(admin, onboarding.checkoutLeadId)
  if (!decideLaunch({ isLaunchRequested: true, leadStatus })) return 'awaiting_payment'

  await publishStore(admin, tenantId, onboarding.checkoutLeadId)
  return 'live'
}

/**
 * Staff confirmed the payment. Marks the lead paid and opens the store if its
 * owner already asked to launch. Returns whether the store opened.
 */
export async function confirmLeadPayment(admin: AdminClient, leadId: string): Promise<{ isPublished: boolean }> {
  const leadStatus = await readLeadStatus(admin, leadId)
  if (leadStatus !== 'live') {
    const { error } = await admin
      .from('checkout_leads')
      .update({ status: 'paid', updated_at: new Date().toISOString() } as never)
      .eq('id', leadId)
    if (error) throw new Error(`The payment could not be confirmed: ${error.message}`)
  }

  const onboarding = await findOnboardingByLead(admin, leadId)
  const canOpen = !!onboarding?.tenantId && decideLaunch({ isLaunchRequested: !!onboarding.launchRequestedAt, leadStatus: 'paid' })
  if (!canOpen || !onboarding?.tenantId) return { isPublished: false }

  await publishStore(admin, onboarding.tenantId, leadId)
  return { isPublished: true }
}
