'use server'

import {
  createCheckoutLead,
  getCheckoutLeads,
  getCheckoutLeadById,
  getCheckoutLeadByRef,
  updateCheckoutLeadStatus,
  uploadPaymentProof,
  getCheckoutLeadHistory,
} from '@/lib/checkout-leads/checkout-leads-service'
import {
  getAllPlatformPaymentMethods,
  getActivePlatformPaymentMethods,
  createPlatformPaymentMethod,
  updatePlatformPaymentMethod,
  deletePlatformPaymentMethod,
  reorderPlatformPaymentMethods,
} from '@/lib/checkout-leads/platform-payment-methods-service'
import type { CheckoutLeadStatus } from '@/types/database'

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
}) {
  return createCheckoutLead(input)
}

export async function fetchCheckoutLeads(options: {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
}) {
  return getCheckoutLeads(options)
}

export async function fetchCheckoutLeadDetail(id: string) {
  const [lead, history] = await Promise.all([
    getCheckoutLeadById(id),
    getCheckoutLeadHistory(id),
  ])
  return { lead: lead.data, history: history.data }
}

export async function fetchCheckoutLeadByRef(ref: string) {
  return getCheckoutLeadByRef(ref)
}

export async function changeCheckoutLeadStatus(
  leadId: string,
  oldStatus: string,
  newStatus: CheckoutLeadStatus,
  userId?: string,
  note?: string
) {
  return updateCheckoutLeadStatus(
    leadId,
    oldStatus as CheckoutLeadStatus,
    newStatus,
    userId,
    note
  )
}

export async function submitPaymentProof(referenceNumber: string, paymentProofUrl: string) {
  return uploadPaymentProof(referenceNumber, paymentProofUrl)
}

// ---- Platform Payment Methods ----

export async function fetchActivePlatformPaymentMethods() {
  return getActivePlatformPaymentMethods()
}

export async function fetchAllPlatformPaymentMethods() {
  return getAllPlatformPaymentMethods()
}

export async function addPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}) {
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
  return updatePlatformPaymentMethod(id, input)
}

export async function removePlatformPaymentMethod(id: string) {
  return deletePlatformPaymentMethod(id)
}

export async function savePlatformPaymentMethodOrder(orderedIds: string[]) {
  return reorderPlatformPaymentMethods(orderedIds)
}
