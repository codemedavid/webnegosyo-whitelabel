'use server'

import {
  createCheckoutLead,
  createPaidCheckoutLead,
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
import { issueOnboardingLink } from '@/lib/onboarding/start'
import { canSendSetupLink, invitePaidCustomerSchema } from '@/lib/onboarding/invite'
import { applyLeadStatusWithLaunch, readLeadOnboarding } from '@/lib/onboarding/staff'
import { findOnboardingByLead } from '@/lib/onboarding/repository'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import type { RateLimitOptions } from '@/lib/distributed-rate-limit'

/**
 * Public funnel submits per client IP. Leads are worked by staff, so an
 * unthrottled form is a flooded console (and Meta conversion noise).
 */
const CHECKOUT_FORM_RATE_LIMIT: RateLimitOptions = { limit: 5, windowSec: 3600 }

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: CreateCheckoutLeadInput) {
  const rate = await checkActionRateLimit('checkout-lead', CHECKOUT_FORM_RATE_LIMIT)
  if (!rate.allowed) {
    return { data: null, error: 'Too many orders from this connection. Please try again later.' }
  }

  // No set-up link here: staff send it once the payment is confirmed
  // (issueLeadSetupLink), so an unpaid order never gets a store.
  const result = await createCheckoutLead(input)

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

  return result
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

/**
 * A fresh set-up link for a PAID buyer; any older link stops working. Path
 * only — the console turns it into a ready-to-send message.
 */
export async function issueLeadSetupLink(leadId: string): Promise<{ path: string | null; error: string | null }> {
  await requirePlatformPermission('checkout_leads.edit')
  try {
    const { data: lead, error } = await createAdminClient().from('checkout_leads').select('status').eq('id', leadId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!canSendSetupLink((lead as { status: string } | null)?.status)) {
      return { path: null, error: 'Mark the payment as Paid first — the set-up link is only for paid customers.' }
    }
    const token = await issueOnboardingLink(leadId)
    return { path: `/onboarding/${token}`, error: null }
  } catch (error) {
    return { path: null, error: error instanceof Error ? error.message : 'Could not create a link' }
  }
}

/**
 * A customer who paid outside the funnel (Messenger, cash, bank transfer):
 * create their lead already marked paid and hand back their set-up link.
 */
export async function invitePaidCustomer(input: unknown): Promise<
  { leadId: string; path: string; error: null } | { leadId: null; path: null; error: string }
> {
  await requirePlatformPermission('checkout_leads.edit')
  const parsed = invitePaidCustomerSchema.safeParse(input)
  if (!parsed.success) return { leadId: null, path: null, error: parsed.error.issues[0]?.message ?? 'Check the form.' }

  const created = await createPaidCheckoutLead(parsed.data)
  if (!created.data) return { leadId: null, path: null, error: created.error ?? 'The customer could not be saved.' }
  try {
    const token = await issueOnboardingLink(created.data.id)
    return { leadId: created.data.id, path: `/onboarding/${token}`, error: null }
  } catch (error) {
    console.error('[checkout-leads] invite link failed', error instanceof Error ? error.message : error)
    // The paid lead exists; staff can issue the link from it.
    return { leadId: null, path: null, error: 'Customer saved, but the link could not be created. Open the lead and press "Send set-up link".' }
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
