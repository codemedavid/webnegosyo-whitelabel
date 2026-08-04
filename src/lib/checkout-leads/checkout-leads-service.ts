import { createAdminClient } from '@/lib/supabase/admin'
import { sendMetaConversionEvent } from '@/lib/meta-conversions'
import {
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
  type CheckoutPaymentTerm,
} from './payment-terms'
import { generateReferenceNumber } from './reference-number'
import type {
  CheckoutLead,
  CheckoutLeadStatus,
  CheckoutLeadWithPaymentMethod,
} from '@/types/database'

/*
 * Status history was removed on 2026-08-03.
 *
 * `checkout_lead_status_history` is declared in
 * `supabase/migrations/20260405000001_checkout_leads.sql` but was never
 * applied, so every write silently failed and every read returned `[]`. The
 * superadmin panel rendered "No status changes yet" unconditionally — a
 * stronger claim than the truth, which was that nothing could be recorded.
 *
 * It was dropped rather than completed because the pipeline it audits has
 * never been worked: all 69 leads sit at `initiated`. Restore it when someone
 * actually moves leads through statuses, and apply the table first.
 */

export interface CreateCheckoutLeadInput {
  name: string
  email: string
  phone: string
  business_name: string
  notes?: string
  selected_payment_method_id: string
  payment_term: CheckoutPaymentTerm
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
  const paymentTerm = input.payment_term

  if (!isCheckoutPaymentTerm(paymentTerm)) {
    return { data: null, error: 'Invalid payment term' }
  }

  const amount = getCheckoutPayableAmount(paymentTerm)

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
        payment_term: paymentTerm,
        amount,
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
          value: data.amount ?? amount,
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
  newStatus: CheckoutLeadStatus
): Promise<MutationResult> {
  const supabase = createAdminClient()

  // Update the lead
  const { error: updateError } = await supabase
    .from('checkout_leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  return { error: updateError?.message ?? null }
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

