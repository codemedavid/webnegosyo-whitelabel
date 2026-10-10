/**
 * Using a sign-up link: the customer's details become a PAID checkout lead at
 * the link's plan, and they get a set-up wizard like any other paid buyer.
 *
 * Order matters. The email check runs before the claim so a typo'd or taken
 * email never spends the link. The claim is one conditional UPDATE, so two
 * people on the same link get one store between them. Until the lead exists a
 * failure gives the use back; after it, the link stays spent (staff can always
 * re-issue the set-up link from the lead).
 */

import type { CheckoutPaymentTerm } from '@/lib/checkout-leads/payment-terms'
import type { JoinFormInput } from './schema'

export interface ClaimedInvite {
  id: string
  label: string
  paymentTerm: CheckoutPaymentTerm
  notes: string | null
}

export interface PaidLeadInput extends JoinFormInput {
  payment_term: CheckoutPaymentTerm
  notes: string
}

export interface RedeemDeps {
  isEmailTaken(email: string): Promise<boolean>
  /** Null when the link is unknown, used, turned off or expired. */
  claimInvite(codeHash: string): Promise<ClaimedInvite | null>
  releaseInvite(inviteId: string): Promise<void>
  createPaidLead(input: PaidLeadInput): Promise<{ id: string } | null>
  attachLead(inviteId: string, leadId: string): Promise<void>
  /** The plain set-up token, or null when the wizard could not be opened. */
  startOnboarding(leadId: string): Promise<string | null>
}

export type RedeemResult =
  | { kind: 'started'; token: string; leadId: string }
  | { kind: 'saved_without_link'; leadId: string }
  | { kind: 'email_taken' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

function leadNotes(invite: ClaimedInvite): string {
  const linkNote = `Sign-up link: ${invite.label}`
  return invite.notes ? `${linkNote}\n${invite.notes}` : linkNote
}

async function createLeadOrRelease(invite: ClaimedInvite, form: JoinFormInput, deps: RedeemDeps): Promise<{ id: string } | null> {
  try {
    const lead = await deps.createPaidLead({ ...form, payment_term: invite.paymentTerm, notes: leadNotes(invite) })
    if (lead) return lead
  } catch (error) {
    console.error('[onboarding-invites] lead could not be saved', error instanceof Error ? error.message : error)
  }
  await deps.releaseInvite(invite.id).catch((error: unknown) =>
    console.error('[onboarding-invites] link could not be given back', { inviteId: invite.id, error: error instanceof Error ? error.message : error }),
  )
  return null
}

export async function redeemInvite(codeHash: string, form: JoinFormInput, deps: RedeemDeps): Promise<RedeemResult> {
  if (await deps.isEmailTaken(form.email)) return { kind: 'email_taken' }

  const invite = await deps.claimInvite(codeHash)
  if (!invite) return { kind: 'unavailable' }

  const lead = await createLeadOrRelease(invite, form, deps)
  if (!lead) return { kind: 'failed' }

  await deps.attachLead(invite.id, lead.id).catch((error: unknown) =>
    console.error('[onboarding-invites] lead could not be linked to its invite', { inviteId: invite.id, leadId: lead.id, error: error instanceof Error ? error.message : error }),
  )

  const token = await deps.startOnboarding(lead.id)
  return token ? { kind: 'started', token, leadId: lead.id } : { kind: 'saved_without_link', leadId: lead.id }
}
