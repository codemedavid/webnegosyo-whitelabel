/**
 * `onboarding_invites` I/O. The table is service-role only (RLS on, no
 * grants), so every function takes the admin client; authorization is the
 * caller's job — `checkout_leads.edit` for staff, a valid code for a customer.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { isCheckoutPaymentTerm, type CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
import type { ClaimedInvite } from './redeem'

type AdminClient = SupabaseClient<Database>
type InviteRow = Database['public']['Tables']['onboarding_invites']['Row']

/** Newest links shown in the console; older ones are history nobody acts on. */
export const INVITE_LIST_LIMIT = 100

export interface OnboardingInvite {
  id: string
  label: string
  paymentTerm: string
  notes: string | null
  expiresAt: string
  claimedAt: string | null
  revokedAt: string | null
  checkoutLeadId: string | null
  createdAt: string
}

const LIST_COLUMNS = 'id, label, payment_term, notes, expires_at, claimed_at, revoked_at, checkout_lead_id, created_at'

type ListedRow = Pick<InviteRow, 'id' | 'label' | 'payment_term' | 'notes' | 'expires_at' | 'claimed_at' | 'revoked_at' | 'checkout_lead_id' | 'created_at'>

function toInvite(row: ListedRow): OnboardingInvite {
  return {
    id: row.id,
    label: row.label,
    paymentTerm: row.payment_term,
    notes: row.notes,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
    revokedAt: row.revoked_at,
    checkoutLeadId: row.checkout_lead_id,
    createdAt: row.created_at,
  }
}

export async function insertInvite(
  admin: AdminClient,
  input: { codeHash: string; label: string; paymentTerm: CheckoutPaymentTerm; notes: string | null; expiresAt: string; createdBy: string },
): Promise<OnboardingInvite> {
  const { data, error } = await admin
    .from('onboarding_invites')
    .insert({
      code_hash: input.codeHash,
      label: input.label,
      payment_term: input.paymentTerm,
      notes: input.notes,
      expires_at: input.expiresAt,
      created_by: input.createdBy,
    })
    .select(LIST_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toInvite(data)
}

export async function listInvites(admin: AdminClient): Promise<OnboardingInvite[]> {
  const { data, error } = await admin
    .from('onboarding_invites')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(INVITE_LIST_LIMIT)
  if (error) throw new Error(error.message)
  return (data ?? []).map(toInvite)
}

/** Turns off a link nobody has used yet. False when there was nothing to turn off. */
export async function revokeInvite(admin: AdminClient, inviteId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('onboarding_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('claimed_at', null)
    .is('revoked_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function findInviteByHash(admin: AdminClient, codeHash: string): Promise<OnboardingInvite | null> {
  const { data, error } = await admin.from('onboarding_invites').select(LIST_COLUMNS).eq('code_hash', codeHash).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toInvite(data) : null
}

/**
 * Spend the link: ONE conditional UPDATE, so of two simultaneous claims only
 * one row comes back. Null = unknown, used, turned off or expired.
 */
export async function claimInvite(admin: AdminClient, codeHash: string): Promise<ClaimedInvite | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('onboarding_invites')
    .update({ claimed_at: nowIso })
    .eq('code_hash', codeHash)
    .is('claimed_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .select('id, label, payment_term, notes')
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null
  if (!isCheckoutPaymentTerm(row.payment_term)) throw new Error(`Invite ${row.id} has an unknown plan`)
  return { id: row.id, label: row.label, paymentTerm: row.payment_term, notes: row.notes }
}

/** Give the use back — only while no lead was attached, so a made store is never re-sold. */
export async function releaseInvite(admin: AdminClient, inviteId: string): Promise<void> {
  const { error } = await admin.from('onboarding_invites').update({ claimed_at: null }).eq('id', inviteId).is('checkout_lead_id', null)
  if (error) throw new Error(error.message)
}

export async function attachInviteLead(admin: AdminClient, inviteId: string, leadId: string): Promise<void> {
  const { data, error } = await admin.from('onboarding_invites').update({ checkout_lead_id: leadId }).eq('id', inviteId).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('invite row not updated')
}

export async function isEmailTaken(admin: AdminClient, email: string): Promise<boolean> {
  const { data, error } = await admin.rpc('onboarding_email_taken', { p_email: email })
  if (error) throw new Error(error.message)
  return data === true
}
