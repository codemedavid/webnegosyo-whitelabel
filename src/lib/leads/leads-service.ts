import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead, LeadStatus, LeadNote, LeadStatusHistoryEntry } from '@/lib/leads/types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  name: string
  email: string
  phone: string
  booking_date: string
  booking_time: string
  source?: string
}

export interface GetLeadsOptions {
  status?: LeadStatus
  search?: string
  page?: number
  pageSize?: number
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface LeadResult {
  data: Lead | null
  error: 'slot_taken' | 'server_error' | null
}

export interface LeadQueryResult {
  data: Lead[] | null
  count: number | null
  error: string | null
}

export interface NoteResult {
  data: LeadNote | null
  error: string | null
}

export interface NotesResult {
  data: LeadNote[] | null
  error: string | null
}

export interface HistoryResult {
  data: LeadStatusHistoryEntry[] | null
  error: string | null
}

export interface MutationResult {
  error: string | null
}

// ---------------------------------------------------------------------------
// 1. createLead
// ---------------------------------------------------------------------------

export async function createLead(input: CreateLeadInput): Promise<LeadResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      booking_date: input.booking_date,
      booking_time: input.booking_time,
      source: input.source ?? 'landing_page',
      status: 'new' as LeadStatus,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'slot_taken' }
    }
    return { data: null, error: 'server_error' }
  }

  return { data: data as Lead, error: null }
}

// ---------------------------------------------------------------------------
// 2. updateLeadStatus
// ---------------------------------------------------------------------------

export async function updateLeadStatus(
  leadId: string,
  oldStatus: LeadStatus | null,
  newStatus: LeadStatus,
  changedBy?: string,
  note?: string
): Promise<MutationResult> {
  const supabase = createAdminClient()

  const { error: updateError } = await supabase
    .from('leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (updateError) {
    return { error: updateError.message }
  }

  const { error: historyError } = await supabase
    .from('lead_status_history')
    .insert({
      lead_id: leadId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: changedBy ?? null,
      note: note ?? null,
    })

  if (historyError) {
    return { error: historyError.message }
  }

  return { error: null }
}

// ---------------------------------------------------------------------------
// 3. getLeads
// ---------------------------------------------------------------------------

export async function getLeads(
  options: GetLeadsOptions = {}
): Promise<LeadQueryResult> {
  const { status, search, page = 1, pageSize = 20 } = options
  const supabase = createAdminClient()

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  if (status) {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  query = query.order('created_at', { ascending: false })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await query.range(from, to)

  if (error) {
    return { data: null, count: null, error: error.message }
  }

  return { data: data as Lead[], count, error: null }
}

// ---------------------------------------------------------------------------
// 4. getLeadById
// ---------------------------------------------------------------------------

export async function getLeadById(
  id: string
): Promise<{ data: Lead | null; error: string | null }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Lead, error: null }
}

// ---------------------------------------------------------------------------
// 5. addNote
// ---------------------------------------------------------------------------

export async function addNote(
  leadId: string,
  note: string,
  createdBy?: string
): Promise<NoteResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_notes')
    .insert({
      lead_id: leadId,
      note,
      created_by: createdBy ?? null,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as LeadNote, error: null }
}

// ---------------------------------------------------------------------------
// 6. getLeadNotes
// ---------------------------------------------------------------------------

export async function getLeadNotes(leadId: string): Promise<NotesResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as LeadNote[], error: null }
}

// ---------------------------------------------------------------------------
// 7. getLeadHistory
// ---------------------------------------------------------------------------

export async function getLeadHistory(leadId: string): Promise<HistoryResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('lead_status_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as LeadStatusHistoryEntry[], error: null }
}

// ---------------------------------------------------------------------------
// 8. convertToTenant
// ---------------------------------------------------------------------------

export async function convertToTenant(
  leadId: string,
  tenantId: string,
  changedBy?: string
): Promise<MutationResult> {
  // Fetch current status for history entry
  const { data: lead, error: fetchError } = await getLeadById(leadId)

  if (fetchError || !lead) {
    return { error: fetchError ?? 'Lead not found' }
  }

  const oldStatus = lead.status
  const supabase = createAdminClient()

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      status: 'converted' as LeadStatus,
      converted_tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  if (updateError) {
    return { error: updateError.message }
  }

  const { error: historyError } = await supabase
    .from('lead_status_history')
    .insert({
      lead_id: leadId,
      old_status: oldStatus,
      new_status: 'converted',
      changed_by: changedBy ?? null,
      note: `Converted to tenant ${tenantId}`,
    })

  if (historyError) {
    return { error: historyError.message }
  }

  return { error: null }
}
