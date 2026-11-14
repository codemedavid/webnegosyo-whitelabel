import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMetaConversionEvent } from '@/lib/meta-conversions'
import { purchaseEventId } from './meta-event-ids'

/**
 * The funnel's server-side Meta events (Conversions API).
 *
 * - Lead: when the order form saves a lead. Same event id as the browser's
 *   pixel Lead, so Meta counts the pair once.
 * - Purchase: ONCE per lead, server only, when staff mark the lead paid
 *   (paid_at is set). It carries the browser signals stored on the lead at
 *   order time, so Meta can tie the payment back to the ad click.
 *   A payment screenshot NEVER sends a Purchase: anyone can upload any
 *   picture, and from 2026-11-13 to 2026-11-14 (when it did) fake screenshots
 *   showed up in Ads Manager as purchases. The upload is AddPaymentInfo
 *   (browser pixel) instead.
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

/**
 * Staff marked the lead paid: send its Purchase once. The claim is ONE
 * conditional UPDATE (browser lead, staff-confirmed paid_at, never claimed);
 * a send that was skipped or refused gives the claim back so a later status
 * change can try again. A send Meta accepted keeps it forever.
 */
export async function sendLeadPurchaseOnce(
  admin: SupabaseClient,
  leadId: string
): Promise<{ sent: boolean; reason?: string }> {
  const claimedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('checkout_leads')
    .update({ meta_purchase_sent_at: claimedAt })
    .eq('id', leadId)
    .is('meta_purchase_sent_at', null)
    .not('paid_at', 'is', null)
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
