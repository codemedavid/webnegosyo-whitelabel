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

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: CreateCheckoutLeadInput) {
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
) {
  await requirePlatformPermission('checkout_leads.edit')
  return updateCheckoutLeadStatus(leadId, newStatus)
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
