import { createAdminClient } from '@/lib/supabase/admin'
import { sendMetaConversionEvent } from '@/lib/meta-conversions'
import { generateReferenceNumber } from './reference-number'
import type {
  CheckoutLead,
  CheckoutLeadStatus,
  CheckoutLeadStatusHistory,
  CheckoutLeadWithPaymentMethod,
} from '@/types/database'

export interface CreateCheckoutLeadInput {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
  amount?: number
  meta?: {
    eventId?: string
    fbp?: string
    fbc?: string
    eventSourceUrl?: string
    clientUserAgent?: string
  }
}

interface MutationResult {
  error: string | null
}

// Create a checkout lead with collision-safe reference number
export async function createCheckoutLead(
  input: CreateCheckoutLeadInput
): Promise<{ data: CheckoutLead | null; error: string | null }> {
  const supabase = createAdminClient()

  // Try up to 5 times to generate a unique reference number
  for (let attempt = 0; attempt < 5; attempt++) {
    const referenceNumber = generateReferenceNumber()

    const { data, error } = await supabase
      .from('checkout_leads')
      .insert({
        reference_number: referenceNumber,
        name: input.name,
        email: input.email,
        phone: input.phone,
        business_name: input.business_name,
        notes: input.notes ?? null,
        selected_payment_method_id: input.selected_payment_method_id,
        amount: input.amount ?? 3899,
      })
      .select()
      .single()

    if (error) {
      // Unique violation on reference_number — retry
      if (error.code === '23505' && error.message.includes('reference_number')) {
        continue
      }
      return { data: null, error: error.message }
    }

    if (input.meta?.eventId) {
      void sendMetaConversionEvent({
        eventName: 'Lead',
        eventId: input.meta.eventId,
        eventSourceUrl: input.meta.eventSourceUrl,
        userData: {
          email: input.email,
          phone: input.phone,
          fbp: input.meta.fbp,
          fbc: input.meta.fbc,
          clientUserAgent: input.meta.clientUserAgent,
        },
        customData: {
          content_name: 'Smart Menu System',
          currency: 'PHP',
          value: data.amount ?? input.amount ?? 3899,
          reference_number: data.reference_number,
        },
      }).catch((metaError) => {
        console.error('[Meta CAPI] Lead event dispatch failed', metaError)
      })
    }

    return { data: data as CheckoutLead, error: null }
  }

  return { data: null, error: 'Failed to generate unique reference number' }
}

// Get checkout lead by reference number (for confirmation page)
export async function getCheckoutLeadByRef(
  ref: string
): Promise<{ data: CheckoutLeadWithPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)')
    .eq('reference_number', ref)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as CheckoutLeadWithPaymentMethod, error: null }
}

// Update payment proof
export async function uploadPaymentProof(
  referenceNumber: string,
  paymentProofUrl: string
): Promise<MutationResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('checkout_leads')
    .update({
      payment_proof_url: paymentProofUrl,
      payment_proof_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('reference_number', referenceNumber)

  return { error: error?.message ?? null }
}

// Update status (superadmin)
export async function updateCheckoutLeadStatus(
  leadId: string,
  oldStatus: CheckoutLeadStatus | null,
  newStatus: CheckoutLeadStatus,
  changedBy?: string,
  note?: string
): Promise<MutationResult> {
  const supabase = createAdminClient()

  // Update the lead
  const { error: updateError } = await supabase
    .from('checkout_leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (updateError) return { error: updateError.message }

  // Insert history record
  const { error: historyError } = await supabase
    .from('checkout_lead_status_history')
    .insert({
      checkout_lead_id: leadId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy ?? null,
      note: note ?? null,
    })

  if (historyError) {
    console.error('Failed to insert status history:', historyError)
  }

  return { error: null }
}

// List checkout leads (superadmin, paginated)
export interface GetCheckoutLeadsOptions {
  status?: CheckoutLeadStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getCheckoutLeads(
  options: GetCheckoutLeadsOptions = {}
): Promise<{ data: CheckoutLeadWithPaymentMethod[]; count: number; error: string | null }> {
  const { status, search, page = 1, pageSize = 20 } = options
  const supabase = createAdminClient()

  let query = supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (search) {
    // Sanitize search input to prevent PostgREST filter injection
    const sanitized = search.replace(/[%_,.()"'\\]/g, '')
    if (sanitized) {
      query = query.or(
        `name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,business_name.ilike.%${sanitized}%,reference_number.ilike.%${sanitized}%`
      )
    }
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) return { data: [], count: 0, error: error.message }
  return {
    data: (data ?? []) as CheckoutLeadWithPaymentMethod[],
    count: count ?? 0,
    error: null,
  }
}

// Get single checkout lead by ID (superadmin)
export async function getCheckoutLeadById(
  id: string
): Promise<{ data: CheckoutLeadWithPaymentMethod | null; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_leads')
    .select('*, platform_payment_methods(*)')
    .eq('id', id)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as CheckoutLeadWithPaymentMethod, error: null }
}

// Get status history for a checkout lead
export async function getCheckoutLeadHistory(
  leadId: string
): Promise<{ data: CheckoutLeadStatusHistory[]; error: string | null }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('checkout_lead_status_history')
    .select('*')
    .eq('checkout_lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as CheckoutLeadStatusHistory[], error: null }
}
