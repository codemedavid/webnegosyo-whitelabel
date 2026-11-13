import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMetaConversionEvent } from '@/lib/meta-conversions'
import { purchaseEventId } from './meta-event-ids'

/**
 * The funnel's server-side Meta events (Conversions API).
 *
 * - Lead: when the order form saves a lead. Same event id as the browser's
 *   pixel Lead, so Meta counts the pair once.
 * - Purchase: ONCE per lead, at whichever comes first:
 *   1. the buyer's payment screenshot is saved (the thank-you screen). The
 *      browser fires the pixel Purchase with the same event id
 *      (`purchaseEventId`), so Meta counts the pair once;
 *   2. staff mark the lead paid (a buyer who paid without a screenshot).
 *   Both carry the browser signals stored on the lead at order time, so Meta
 *   can tie the payment back to the ad click. A screenshot is the buyer's
 *   word, not staff's: Purchase counts buyers who say they paid.
 *
 * Only leads that came through a browser carry `meta_attribution`; staff
 * invites and sign-up links never send either event.
 */

const OFFER_CONTENT_NAME = 'Smart Menu System'

/** What the order form's browser sent, clipped; plus the IP the server saw. */
export interface LeadMetaAttribution {
  leadEventId: string
  fbp?: string
  fbc?: string
  clientUserAgent?: string
  eventSourceUrl?: string
  clientIpAddress?: string
}

/** The browser half, as the order form posts it (untrusted). */
export interface LeadMetaInput {
  eventId?: string
  fbp?: string
  fbc?: string
  eventSourceUrl?: string
  clientUserAgent?: string
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return undefined
  // Printable ASCII only: these are cookie values, a URL and a user agent.
  return /^[\x20-\x7E]+$/.test(trimmed) ? trimmed : undefined
}

function clipUrl(value: unknown): string | undefined {
  const url = clip(value, 1000)
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

/**
 * The attribution to store on a lead, or null when the browser sent no event
 * id (not a pixel-bearing page). Every field is optional and clipped: a bad
 * cookie is dropped, never an error, because it must never cost the lead.
 */
export function toLeadMetaAttribution(
  meta: LeadMetaInput | undefined,
  clientIpAddress: string | null
): LeadMetaAttribution | null {
  const leadEventId = clip(meta?.eventId, 100)
  if (!leadEventId) return null
  return {
    leadEventId,
    fbp: clip(meta?.fbp, 200),
    fbc: clip(meta?.fbc, 500),
    clientUserAgent: clip(meta?.clientUserAgent, 512),
    eventSourceUrl: clipUrl(meta?.eventSourceUrl),
    clientIpAddress: clip(clientIpAddress, 64),
  }
}

function readAttribution(value: unknown): LeadMetaAttribution | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  return toLeadMetaAttribution(
    {
      eventId: row.leadEventId as string | undefined,
      fbp: row.fbp as string | undefined,
      fbc: row.fbc as string | undefined,
      clientUserAgent: row.clientUserAgent as string | undefined,
      eventSourceUrl: row.eventSourceUrl as string | undefined,
    },
    typeof row.clientIpAddress === 'string' ? row.clientIpAddress : null
  )
}

/**
 * Run after the response when Next can (serverless keeps the function alive
 * for it); outside a request, run it now. Await this: it only registers the
 * task. next/server is loaded lazily because loading it at import time throws
 * outside the Next runtime (jsdom tests import the actions file).
 */
export async function runAfterResponse(task: () => Promise<unknown>): Promise<void> {
  let schedule: ((task: () => Promise<unknown>) => void) | null = null
  try {
    schedule = (await import('next/server')).after
  } catch {
    schedule = null
  }
  if (schedule) {
    try {
      schedule(task)
      return
    } catch {
      // Not inside a request scope: fall through and run it now.
    }
  }
  await task()
}

interface LeadForMeta {
  reference_number: string
  email: string
  phone: string
  amount: number | null
}

export async function sendLeadConversion(lead: LeadForMeta, attribution: LeadMetaAttribution) {
  const result = await sendMetaConversionEvent({
    eventName: 'Lead',
    eventId: attribution.leadEventId,
    eventSourceUrl: attribution.eventSourceUrl,
    userData: {
      email: lead.email,
      phone: lead.phone,
      fbp: attribution.fbp,
      fbc: attribution.fbc,
      clientIpAddress: attribution.clientIpAddress,
      clientUserAgent: attribution.clientUserAgent,
      externalId: lead.reference_number,
      country: 'ph',
    },
    customData: {
      content_name: OFFER_CONTENT_NAME,
      currency: 'PHP',
      value: lead.amount ?? undefined,
      reference_number: lead.reference_number,
    },
  })
  if (!result.sent && !('skipped' in result)) {
    console.error('[Meta CAPI] Lead not accepted', { reference: lead.reference_number })
  }
  return result
}

/** Statuses that mean staff confirmed the money (paid_at is set by trigger). */
export const META_PURCHASE_STATUSES: ReadonlySet<string> = new Set(['paid', 'setup_in_progress', 'live'])

/** Which lead to claim, and what must be true of it besides "browser lead, never sent". */
interface PurchaseClaim {
  column: 'id' | 'reference_number'
  value: string
  /** paid_at (staff confirmed) or payment_proof_url (buyer uploaded a screenshot). */
  requires: 'paid_at' | 'payment_proof_url'
}

/**
 * Send the lead's Purchase once. The claim is ONE conditional UPDATE
 * (browser lead, never claimed, plus `requires`); a send that was skipped or
 * refused gives the claim back so a later moment can try again. A send that
 * Meta accepted keeps it forever, so the proof and the staff path never both
 * send.
 */
async function claimAndSendPurchase(
  admin: SupabaseClient,
  claim: PurchaseClaim
): Promise<{ sent: boolean; reason?: string }> {
  const claimedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('checkout_leads')
    .update({ meta_purchase_sent_at: claimedAt })
    .eq(claim.column, claim.value)
    .is('meta_purchase_sent_at', null)
    .not(claim.requires, 'is', null)
    .not('meta_attribution', 'is', null)
    .select('id, reference_number, email, phone, amount, meta_attribution')
    .maybeSingle()

  if (error) {
    console.error('[Meta CAPI] Purchase claim failed', error.message)
    return { sent: false, reason: 'claim-failed' }
  }
  if (!data) return { sent: false, reason: 'not-eligible' }

  const lead = data as LeadForMeta & { id: string; meta_attribution: unknown }
  const attribution = readAttribution(lead.meta_attribution)
  const result = attribution
    ? await sendMetaConversionEvent({
        eventName: 'Purchase',
        eventId: purchaseEventId(lead.reference_number),
        eventSourceUrl: attribution.eventSourceUrl,
        userData: {
          email: lead.email,
          phone: lead.phone,
          fbp: attribution.fbp,
          fbc: attribution.fbc,
          clientIpAddress: attribution.clientIpAddress,
          clientUserAgent: attribution.clientUserAgent,
          externalId: lead.reference_number,
          country: 'ph',
        },
        customData: {
          content_name: OFFER_CONTENT_NAME,
          currency: 'PHP',
          value: lead.amount ?? undefined,
          order_id: lead.reference_number,
        },
      }).catch((sendError: unknown) => ({ sent: false as const, error: sendError }))
    : { sent: false as const, skipped: 'no-attribution' as const }

  if (result.sent) return { sent: true }

  // Not sent: give the claim back (only our own claim) so a later moment retries.
  await admin
    .from('checkout_leads')
    .update({ meta_purchase_sent_at: null })
    .eq('id', lead.id)
    .eq('meta_purchase_sent_at', claimedAt)
  console.error('[Meta CAPI] Purchase not sent', { reference: lead.reference_number })
  return { sent: false, reason: 'send-failed' }
}

/** Staff marked the lead paid: Purchase, unless the screenshot already sent it. */
export function sendLeadPurchaseOnce(admin: SupabaseClient, leadId: string) {
  return claimAndSendPurchase(admin, { column: 'id', value: leadId, requires: 'paid_at' })
}

/** The buyer's screenshot was saved (thank-you screen): Purchase, once. */
export function sendProofPurchaseOnce(admin: SupabaseClient, referenceNumber: string) {
  return claimAndSendPurchase(admin, { column: 'reference_number', value: referenceNumber, requires: 'payment_proof_url' })
}
