/**
 * The customer app's delivery quote, decided with the checkout's own rules so
 * the order route bills what the app showed:
 *
 *  - delivery must be one of the store's online order types;
 *  - a multi-branch store's branch is checked like `createOrderAction` checks it
 *    (`requireCheckoutOutlet`), and must deliver;
 *  - the delivery starts where the order engine starts it: the branch's own
 *    pin and radius when it has one, else the store's (`resolveDeliveryOrigin`);
 *  - a pin outside the country is refused, as the engine refuses it;
 *  - Lalamove stores get a signed quotation (`createSignedLalamoveQuote`, the
 *    same path as `createQuotationAction`, signed for that branch), handed over
 *    as an opaque `quoteToken`;
 *  - otherwise the distance formula (`quoteDistanceDelivery` + `judgeDistanceQuote`,
 *    the same pair `resolveOrderDeliveryFee` runs), or no fee when the store
 *    has no delivery pricing (as the checkout).
 *
 * The free-delivery waiver depends on the cart, so the RAW fee is returned with
 * `freeDeliveryMinimum`; the order route waives it from the server-priced subtotal.
 *
 * Pure apart from the injected reads, so every branch is unit-tested.
 */
import type { AppDeliveryQuote, AppDeliveryQuoteRequest, AppErrorCode } from '@/lib/app-contract'
import { judgeDistanceQuote } from '@/lib/checkout/order-delivery-fee'
import {
  distanceConfigFromTenant,
  quoteDistanceDelivery,
  type DistanceDeliveryTenantFields,
  type MeasureDistanceKm,
} from '@/lib/delivery-fee'
import { DELIVERY_MISCONFIGURED_MESSAGE } from '@/lib/delivery-quote'
import {
  resolveDeliveryOrigin,
  type DeliveryOrigin,
  type OriginOutletFields,
  type OriginStoreFields,
} from '@/lib/delivery/delivery-origin'
import { withOriginRadius } from '@/lib/delivery/distance-quote-server'
import { assessDeliveryPin } from '@/lib/delivery/pin-assessment'
import { resolveFreeDeliveryThreshold } from '@/lib/free-delivery'
import type { SignedLalamoveQuote } from '@/lib/delivery/lalamove-signed-quote'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { requireCheckoutOutlet, type OrderOutletCandidate } from '@/lib/outlets/order-outlet'
import { encodeAppQuoteToken } from './quote-token'

/**
 * A store-side "no" the customer can act on (another address, branch or order
 * type). The envelope has no dedicated code; 409 is the closest.
 */
export const QUOTE_REFUSED_CODE: AppErrorCode = 'refused'

export const NO_DELIVERY_MESSAGE = 'This store is not taking delivery orders right now. Try pickup instead.'
export const BRANCH_NO_DELIVERY_MESSAGE = 'This branch does not deliver. Choose another branch or pick up instead.'
export const QUOTE_UNAVAILABLE_MESSAGE = 'We could not get a delivery fee right now. Please try again in a moment.'
export const QUOTE_BUSY_MESSAGE = 'Too many delivery quotes right now. Please try again in a moment.'
export const OUTSIDE_COUNTRY_MESSAGE =
  'This address is outside the Philippines. Search again and pick the right spot on the map.'

export interface DeliveryQuoteTenant extends DistanceDeliveryTenantFields, OriginStoreFields {
  id: string
  multi_branch_enabled?: boolean | null
  lalamove_market?: string | null
  free_delivery_min_order?: number | string | null
}

export interface DeliveryQuoteOutlet extends OrderOutletCandidate, OriginOutletFields {
  supports_delivery: boolean
}

export type LalamoveQuoteAttempt = SignedLalamoveQuote | { ok: false; reason: 'rate-limited'; retryAfterSec: number }

export interface DeliveryQuoteDeps {
  /** The pricing row, or null when the store is gone. */
  readTenant: (tenantId: string) => Promise<DeliveryQuoteTenant | null>
  /** ALL the store's branches, hidden ones too — as the checkout reads them. */
  readOutlets: (tenantId: string) => Promise<DeliveryQuoteOutlet[]>
  /** `type` of every order type the store offers online. */
  readOrderTypeKinds: (tenantId: string) => Promise<string[]>
  /** Quote + sign with the store's own Lalamove account (throws on a Lalamove failure). */
  quoteLalamove: (
    tenantId: string,
    origin: DeliveryOrigin | null,
    destination: { address: string; lat: number; lng: number },
  ) => Promise<LalamoveQuoteAttempt>
  measureKm: MeasureDistanceKm
}

export type DeliveryQuoteOutcome =
  | { ok: true; quote: AppDeliveryQuote }
  | { ok: false; code: AppErrorCode; message: string; retryAfterSec?: number }

const refuse = (message: string): DeliveryQuoteOutcome => ({ ok: false, code: QUOTE_REFUSED_CODE, message })
const unavailable = (message: string): DeliveryQuoteOutcome => ({ ok: false, code: 'unavailable', message })

const roundKm = (km: number): number => Math.round(km * 100) / 100

/**
 * The branch row the order engine will resolve (null for a single-location
 * store), or the refusal. Its pin is where the delivery starts.
 */
async function checkBranch(
  tenant: DeliveryQuoteTenant,
  outletId: string | null,
  deps: DeliveryQuoteDeps
): Promise<{ ok: true; branch: DeliveryQuoteOutlet | null } | { ok: false; outcome: DeliveryQuoteOutcome }> {
  if (!isMultiBranchEnabled(tenant)) return { ok: true, branch: null }
  const outlets = await deps.readOutlets(tenant.id)
  let outlet: { id: string } | null
  try {
    outlet = requireCheckoutOutlet({ isEnabled: true, requestedOutletId: outletId, outlets })
  } catch (error) {
    return { ok: false, outcome: refuse(error instanceof Error ? error.message : 'Choose a branch first.') }
  }
  const branch = outlet ? outlets.find((candidate) => candidate.id === outlet.id) ?? null : null
  if (branch && branch.supports_delivery !== true) return { ok: false, outcome: refuse(BRANCH_NO_DELIVERY_MESSAGE) }
  return { ok: true, branch }
}

async function quoteByLalamove(
  tenantId: string,
  origin: DeliveryOrigin | null,
  request: AppDeliveryQuoteRequest,
  freeDeliveryMinimum: number | null,
  deps: DeliveryQuoteDeps
): Promise<DeliveryQuoteOutcome> {
  let attempt: LalamoveQuoteAttempt
  try {
    attempt = await deps.quoteLalamove(tenantId, origin, { address: request.address, lat: request.lat, lng: request.lng })
  } catch (error) {
    // Lalamove said no or was unreachable; its wording is not written for a diner.
    console.error('[app-api:delivery-quote] Lalamove quotation failed', {
      tenantId,
      message: error instanceof Error ? error.message : String(error),
    })
    return unavailable(QUOTE_UNAVAILABLE_MESSAGE)
  }
  if (!attempt.ok) {
    if (attempt.reason === 'rate-limited') {
      return { ok: false, code: 'rate_limited', message: QUOTE_BUSY_MESSAGE, retryAfterSec: attempt.retryAfterSec }
    }
    return unavailable(attempt.reason === 'pickup-unset' ? attempt.error : QUOTE_UNAVAILABLE_MESSAGE)
  }
  const quoteToken = encodeAppQuoteToken({ quotationId: attempt.quotationId, signature: attempt.quoteSignature })
  if (!quoteToken) return unavailable(QUOTE_UNAVAILABLE_MESSAGE)
  return {
    ok: true,
    quote: {
      fee: attempt.fee,
      freeDeliveryMinimum,
      etaMinutes: null,
      quoteToken,
      expiresAt: new Date(attempt.signatureExpiresAt).toISOString(),
      distanceKm: null,
    },
  }
}

async function quoteByDistance(
  tenant: DeliveryQuoteTenant,
  origin: DeliveryOrigin | null,
  request: AppDeliveryQuoteRequest,
  freeDeliveryMinimum: number | null,
  deps: DeliveryQuoteDeps
): Promise<DeliveryQuoteOutcome> {
  const unpriced = { freeDeliveryMinimum, etaMinutes: null, quoteToken: null, expiresAt: null }
  const storeConfig = distanceConfigFromTenant(tenant)
  // No delivery pricing: the checkout bills no fee either.
  if (!storeConfig) return { ok: true, quote: { ...unpriced, fee: 0, distanceKm: null } }
  const config = withOriginRadius(storeConfig, origin)

  const outcome = await quoteDistanceDelivery({
    config,
    store: origin?.point ?? null,
    destination: { lat: request.lat, lng: request.lng },
    measureKm: deps.measureKm,
  })
  const verdict = judgeDistanceQuote(outcome, config)
  if (verdict.kind === 'abort') return unavailable(DELIVERY_MISCONFIGURED_MESSAGE)
  if (verdict.kind === 'refuse') return refuse(verdict.error)
  const distanceKm = outcome.kind === 'quote' ? roundKm(outcome.quote.distanceKm) : null
  return { ok: true, quote: { ...unpriced, fee: verdict.fee ?? 0, distanceKm } }
}

export async function quoteAppDelivery(
  tenantId: string,
  request: AppDeliveryQuoteRequest,
  deps: DeliveryQuoteDeps
): Promise<DeliveryQuoteOutcome> {
  const [kinds, tenant] = await Promise.all([deps.readOrderTypeKinds(tenantId), deps.readTenant(tenantId)])
  if (!kinds.includes('delivery')) return refuse(NO_DELIVERY_MESSAGE)
  if (!tenant || tenant.id !== tenantId) return unavailable(QUOTE_UNAVAILABLE_MESSAGE)

  if (assessDeliveryPin({
    pin: { lat: request.lat, lng: request.lng },
    origin: null,
    market: tenant.lalamove_market,
    lalamoveEnabled: tenant.lalamove_enabled === true,
  }).isBlocked) {
    return refuse(OUTSIDE_COUNTRY_MESSAGE)
  }

  const branch = await checkBranch(tenant, request.outletId, deps)
  if (!branch.ok) return branch.outcome
  const origin = resolveDeliveryOrigin(tenant, branch.branch)

  const freeDeliveryMinimum = resolveFreeDeliveryThreshold(tenant.free_delivery_min_order)
  return tenant.lalamove_enabled === true
    ? quoteByLalamove(tenantId, origin, request, freeDeliveryMinimum, deps)
    : quoteByDistance(tenant, origin, request, freeDeliveryMinimum, deps)
}
