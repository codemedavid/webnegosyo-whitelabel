'use server'

import {
  createCheckoutLead,
  getCheckoutLeads,
  getCheckoutLeadById,
  getCheckoutLeadByRef,
  updateCheckoutLeadStatus,
  uploadPaymentProof,
  type CreateCheckoutLeadInput,
} from '@/lib/checkout-leads/checkout-leads-service'
import {
  getAllPlatformPaymentMethods,
  getActivePlatformPaymentMethods,
  createPlatformPaymentMethod,
  updatePlatformPaymentMethod,
  deletePlatformPaymentMethod,
  reorderPlatformPaymentMethods,
} from '@/lib/checkout-leads/platform-payment-methods-service'
import { getCheckoutPayableAmount } from '@/lib/checkout-leads/payment-terms'
import { requirePlatformPermission } from '@/lib/platform-staff/guard'
import type { CheckoutLeadStatus } from '@/types/database'
import { captureCheckoutLeadCreated } from '@/lib/posthog'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueOnboardingLink, startStoreOnboarding } from '@/lib/onboarding/start'
import { applyLeadStatusWithLaunch, readLeadOnboarding } from '@/lib/onboarding/staff'
import { findOnboardingByLead } from '@/lib/onboarding/repository'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import type { RateLimitOptions } from '@/lib/distributed-rate-limit'

/**
 * Public funnel submits per client IP. Each monthly lead mints a set-up link
 * that creates a store, an owner login and an AI menu read, so an unthrottled
 * form is unbounded tenants and AI spend for a script.
 */
const CHECKOUT_FORM_RATE_LIMIT: RateLimitOptions = { limit: 5, windowSec: 3600 }

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: CreateCheckoutLeadInput) {
  const rate = await checkActionRateLimit('checkout-lead', CHECKOUT_FORM_RATE_LIMIT)
  if (!rate.allowed) {
    return { data: null, error: 'Too many orders from this connection. Please try again later.', setupToken: null }
  }

  const result = await createCheckoutLead(input)

  // The ₱999/month funnel continues straight into the store set-up wizard.
  const setupToken =
    result.data && !result.error && input.payment_term === 'monthly_subscription'
      ? await startStoreOnboarding(result.data.id)
      : null

  if (result.data && !result.error) {
    captureCheckoutLeadCreated({
      name: input.name,
      email: input.email,
      phone: input.phone,
      businessName: input.business_name,
      referenceNumber: result.data.reference_number,
      amount: result.data.amount ?? getCheckoutPayableAmount(input.payment_term),
    }).catch(() => {})
  }

  return { ...result, setupToken }
}

export async function fetchCheckoutLeads(options: {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
}) {
  await requirePlatformPermission('checkout_leads.view')
  return getCheckoutLeads(options)
}

export async function fetchCheckoutLeadDetail(id: string) {
  await requirePlatformPermission('checkout_leads.view')
  const lead = await getCheckoutLeadById(id)
  return { lead: lead.data }
}

export async function fetchCheckoutLeadByRef(ref: string) {
  return getCheckoutLeadByRef(ref)
}

export async function changeCheckoutLeadStatus(
  leadId: string,
  newStatus: CheckoutLeadStatus
): Promise<{ error: string | null; isPublished?: boolean }> {
  await requirePlatformPermission('checkout_leads.edit')
  try {
    // "paid" and "live" also open an onboarded store; see applyLeadStatusWithLaunch.
    const launch = await applyLeadStatusWithLaunch(leadId, newStatus)
    if (launch.handled) return { error: null, isPublished: launch.isPublished }
  } catch (error) {
    console.error('[checkout-leads] launch-aware status change failed', error)
    return { error: error instanceof Error ? error.message : 'Status change failed' }
  }
  return updateCheckoutLeadStatus(leadId, newStatus)
}

// ---- Store onboarding (₱999 funnel) ----

export async function fetchLeadOnboarding(leadId: string) {
  await requirePlatformPermission('checkout_leads.view')
  return readLeadOnboarding(leadId)
}

/** A fresh set-up link for the buyer; the old one stops working. Path only. */
export async function issueLeadSetupLink(leadId: string): Promise<{ path: string | null; error: string | null }> {
  await requirePlatformPermission('checkout_leads.edit')
  try {
    const token = await issueOnboardingLink(leadId)
    return { path: `/onboarding/${token}`, error: null }
  } catch (error) {
    return { path: null, error: error instanceof Error ? error.message : 'Could not create a link' }
  }
}

export async function retryLeadOnboardingBuild(leadId: string): Promise<{ error: string | null }> {
  await requirePlatformPermission('checkout_leads.edit')
  const onboarding = await findOnboardingByLead(createAdminClient(), leadId)
  // Lazy: the build pulls in sharp and the AI parser, which this module's
  // other actions (the public funnel form) must not load.
  const [{ after }, { runOnboardingBuild }, { isBuildRetryable }] = await Promise.all([
    import('next/server'),
    import('@/lib/onboarding/build'),
    import('@/lib/onboarding/build-staleness'),
  ])
  // Failed, or died mid-run (queued/running with no progress past the stale window).
  if (!onboarding || !isBuildRetryable(onboarding)) return { error: 'Nothing to retry.' }
  after(async () => {
    await runOnboardingBuild(createAdminClient(), onboarding.id).catch((error: unknown) =>
      console.error('[checkout-leads] onboarding retry failed', error)
    )
  })
  return { error: null }
}

export async function submitPaymentProof(referenceNumber: string, paymentProofUrl: string) {
  try {
    const url = new URL(paymentProofUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { error: 'Invalid payment proof URL' }
    }
  } catch {
    return { error: 'Invalid payment proof URL' }
  }
  return uploadPaymentProof(referenceNumber, paymentProofUrl)
}

// ---- Platform Payment Methods ----

export async function fetchActivePlatformPaymentMethods() {
  return getActivePlatformPaymentMethods()
}

export async function fetchAllPlatformPaymentMethods() {
  await requirePlatformPermission('payment_methods.view')
  return getAllPlatformPaymentMethods()
}

export async function addPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}) {
  await requirePlatformPermission('payment_methods.create')
  return createPlatformPaymentMethod(input)
}

export async function editPlatformPaymentMethod(
  id: string,
  input: {
    name?: string
    type?: 'qr_code' | 'bank_transfer' | 'other'
    details?: string
    qr_code_url?: string | null
    is_active?: boolean
  }
) {
  await requirePlatformPermission('payment_methods.edit')
  return updatePlatformPaymentMethod(id, input)
}

export async function removePlatformPaymentMethod(id: string) {
  await requirePlatformPermission('payment_methods.delete')
  return deletePlatformPaymentMethod(id)
}

export async function savePlatformPaymentMethodOrder(orderedIds: string[]) {
  await requirePlatformPermission('payment_methods.edit')
  return reorderPlatformPaymentMethods(orderedIds)
}
