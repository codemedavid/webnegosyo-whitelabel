/**
 * "Where does my card stand?", answered from a phone number alone.
 *
 * The receipt page can authorize a loyalty read with the order's tracking
 * token, but the two places a customer most wants to see their card — the
 * checkout form and the claim form, both BEFORE any order carries their number
 * — have no such token. This is that read, and it is deliberately the smallest
 * possible one: a balance, a threshold and a reward label for the number the
 * customer just typed. It returns no name, no history, no orders, and never
 * echoes the number back.
 *
 * Silent (offer and card both null) whenever the store is not really running
 * loyalty, for the same reason as `describeLoyaltyOffer`: a promise the ledger
 * will not keep is worse than no promise.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneE164 } from '@/lib/phone'
import { countAvailableLoyaltyRewards, readLoyaltyBalance } from './balance-reads'
import { describeLoyaltyOffer, type LoyaltyOffer } from './offer'
import { selectLiveProgram } from './live-program'
import { summarizeStampCard, type OrderStampCard } from './stamp-status'
import { loadActiveLoyaltyPrograms, loadLoyaltyTenantFlags } from './store'

export interface PhoneLoyaltyProgressQuery {
  tenantId: string
  /** Any dialling form; normalized to the one identity the ledger keys on. */
  phone: string
  /** The branch being ordered from, when the surface knows one. */
  outletId?: string | null
}

export interface PhoneLoyaltyProgress {
  /** What the store promises, or null when it promises nothing today. */
  offer: LoyaltyOffer | null
  /** This number's standing on that offer, or null when there is no offer. */
  card: OrderStampCard | null
}

export type PhoneLoyaltyProgressResult =
  | { ok: true; progress: PhoneLoyaltyProgress }
  | { ok: false; error: 'invalid_phone' | 'unavailable' }

const SILENT: PhoneLoyaltyProgressResult = { ok: true, progress: { offer: null, card: null } }

export async function getPhoneLoyaltyProgress(
  query: PhoneLoyaltyProgressQuery,
): Promise<PhoneLoyaltyProgressResult> {
  const phoneE164 = normalizePhoneE164(query.phone)
  if (!phoneE164) return { ok: false, error: 'invalid_phone' }

  try {
    const admin = createAdminClient()
    const [flags, programs] = await Promise.all([
      loadLoyaltyTenantFlags(admin, query.tenantId),
      loadActiveLoyaltyPrograms(admin, query.tenantId, { includeInactive: true }),
    ])
    if (!flags.isEnabled || flags.isShadow) return SILENT

    const customerKey = `phone:${phoneE164}`
    let program = selectLiveProgram(programs, { nowMs: Date.now(), outletId: query.outletId })
    const offer = program ? describeLoyaltyOffer(flags, [program]) : null
    if (!program) {
      const eligibleIds = programs.filter(p => p.status !== 'draft' && p.activatesAt && Date.parse(p.activatesAt) <= Date.now() && (p.scope === 'business' || p.outletId === query.outletId)).map(p => p.id)
      if (!eligibleIds.length) return SILENT
      const { data: held, error } = await admin.from('loyalty_balances').select('program_id')
        .eq('tenant_id', query.tenantId).eq('customer_key', customerKey).in('program_id', eligibleIds)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error('Existing card could not be read')
      program = programs.find(p => p.id === held?.program_id) ?? null
      if (!program) return SILENT
    }
    const [balance, rewardsAvailable] = await Promise.all([
      readLoyaltyBalance(admin, query.tenantId, program.id, customerKey),
      countAvailableLoyaltyRewards(admin, query.tenantId, program.id, customerKey),
    ])

    const card = summarizeStampCard({
      programs: [program],
      earnedProgramId: program.id,
      balance,
      rewardsAvailable,
    })
    // Nothing here was earned by an order in front of us — this is the card as
    // it stands, so the surface words it as progress rather than a new stamp.
    return { ok: true, progress: { offer, card: card ? { ...card, earnedOnOrder: false } : null } }
  } catch (err) {
    console.error('[Loyalty Progress] Error:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}
