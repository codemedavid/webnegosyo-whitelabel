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
import { createClient } from '@/lib/supabase/server'
import type { CheckoutLeadStatus } from '@/types/database'
import { captureCheckoutLeadCreated } from '@/lib/posthog'

async function verifySuperadmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  const { data: userRole } = await supabase
    .from('app_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = userRole as { role: string } | null
  if (!role || role.role !== 'superadmin') {
    throw new Error('Forbidden: Superadmin access required')
  }

  return user
}

// ---- Checkout Leads ----

export async function submitCheckoutForm(input: {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
}) {
  const result = await createCheckoutLead(input)

  if (result.data && !result.error) {
    captureCheckoutLeadCreated({
      name: input.name,
      email: input.email,
      phone: input.phone,
      businessName: input.business_name,
      referenceNumber: result.data.reference_number,
      amount: result.data.amount ?? 3899,
    }).catch(() => {})
  }

  return result
}

export async function fetchCheckoutLeads(options: {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
}) {
  await verifySuperadmin()
  return getCheckoutLeads(options)
}

export async function fetchCheckoutLeadDetail(id: string) {
  await verifySuperadmin()
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
  await verifySuperadmin()
  return updateCheckoutLeadStatus(
    leadId,
    oldStatus as CheckoutLeadStatus,
    newStatus,
    userId,
    note
  )
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
  await verifySuperadmin()
  return getAllPlatformPaymentMethods()
}

export async function addPlatformPaymentMethod(input: {
  name: string
  type: 'qr_code' | 'bank_transfer' | 'other'
  details?: string
  qr_code_url?: string
}) {
  await verifySuperadmin()
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
  await verifySuperadmin()
  return updatePlatformPaymentMethod(id, input)
}

export async function removePlatformPaymentMethod(id: string) {
  await verifySuperadmin()
  return deletePlatformPaymentMethod(id)
}

export async function savePlatformPaymentMethodOrder(orderedIds: string[]) {
  await verifySuperadmin()
  return reorderPlatformPaymentMethods(orderedIds)
}
