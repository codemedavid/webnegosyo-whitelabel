/**
 * A Lalamove delivery quotation the order can later trust: quoted from the
 * STORE's own pin and signed (delivery-quote-signature.ts) so the order bills
 * exactly what Lalamove priced. One implementation for the web checkout
 * (`createQuotationAction`) and the customer app (`POST /api/app/v1/delivery/quote`).
 */
import type { Tenant } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import { createLalamoveQuotation } from '@/lib/lalamove-service'
import { toFiniteNumber } from '@/lib/lalamove-order-details'
import { DELIVERY_QUOTE_SIGNATURE_TTL_MS, signDeliveryQuote } from '@/lib/checkout/delivery-quote-signature'

/**
 * The tenant columns Lalamove work actually needs. Several callers are
 * reachable from anonymous checkout traffic, so the row must be named column
 * by column — a select('*') drags every secret on the tenants table into an
 * anon-reachable code path.
 */
export const LALAMOVE_TENANT_COLUMNS =
  'id, name, footer_business_name, footer_phone, footer_whatsapp, ' +
  'lalamove_enabled, lalamove_market, ' +
  'lalamove_service_type, lalamove_sandbox, lalamove_sender_phone'

/** What a quotation also needs: the store's pickup address and pin. */
export const LALAMOVE_PICKUP_COLUMNS = 'restaurant_address, restaurant_latitude, restaurant_longitude'

/**
 * Quotations are billable calls against the tenant's own Lalamove account. This
 * per-store cap (Redis, shared by every caller under `lalamoveQuoteRateKey`)
 * bounds what the merchant's account can be billed for.
 */
export const LALAMOVE_TENANT_QUOTE_LIMIT = { limit: 30, windowSec: 60 }
export const lalamoveQuoteRateKey = (tenantId: string): string => `lalamove-quote:${tenantId}`

/**
 * The signing keys live in `tenant_secrets`, which anon is never granted —
 * and quoting is an anonymous action — so they are read with the service
 * role, and only for a store that has Lalamove switched on. The keys never
 * leave the server: the SDK consumes them and callers return quotation data only.
 */
export async function withLalamoveKeys(tenant: Tenant): Promise<Tenant> {
  if (!tenant.lalamove_enabled) return tenant
  return mergeTenantSecrets(tenant, await getTenantSecrets(createAdminClient(), tenant.id))
}

export interface LalamoveDestination {
  address: string
  lat: number
  lng: number
}

export type SignedLalamoveQuote =
  | {
      ok: true
      quotationId: string
      fee: number
      currency: string
      /** Lalamove's own expiry for the quotation. */
      providerExpiresAt: number
      /** When the signature stops being accepted: never later than the provider's expiry. */
      signatureExpiresAt: number
      quoteSignature: string
    }
  | { ok: false; reason: 'pickup-unset' | 'unsigned'; error: string }

export const LALAMOVE_PICKUP_UNSET_MESSAGE = 'This store has not set its pickup location yet. Please contact the store.'
export const LALAMOVE_UNSIGNED_MESSAGE =
  'Could not verify a valid delivery quotation. Please try again or contact the store.'

/**
 * Quote a delivery from the store's pin (never a caller-supplied pickup) and
 * sign the price. `tenant` must already carry its keys (`withLalamoveKeys`).
 * Lalamove failures throw, as `createLalamoveQuotation` does.
 */
export async function createSignedLalamoveQuote(
  tenant: Tenant,
  destination: LalamoveDestination,
  now: number = Date.now()
): Promise<SignedLalamoveQuote> {
  const pickupAddress = tenant.restaurant_address
  const pickupLat = toFiniteNumber(tenant.restaurant_latitude)
  const pickupLng = toFiniteNumber(tenant.restaurant_longitude)
  if (!pickupAddress || pickupLat === undefined || pickupLng === undefined) {
    return { ok: false, reason: 'pickup-unset', error: LALAMOVE_PICKUP_UNSET_MESSAGE }
  }

  const quotation = await createLalamoveQuotation(
    tenant,
    pickupAddress,
    { lat: pickupLat, lng: pickupLng },
    destination.address,
    { lat: destination.lat, lng: destination.lng },
  )

  const providerExpiresAt = new Date(quotation.expiresAt).getTime()
  const quoteSignature = signDeliveryQuote(
    {
      tenantId: tenant.id,
      quotationId: quotation.quotationId,
      fee: quotation.price,
      destination,
      expiresAt: providerExpiresAt,
    },
    now
  )
  if (!quoteSignature) return { ok: false, reason: 'unsigned', error: LALAMOVE_UNSIGNED_MESSAGE }

  return {
    ok: true,
    quotationId: quotation.quotationId,
    fee: quotation.price,
    currency: quotation.currency,
    providerExpiresAt,
    signatureExpiresAt: Math.min(providerExpiresAt, now + DELIVERY_QUOTE_SIGNATURE_TTL_MS),
    quoteSignature,
  }
}
