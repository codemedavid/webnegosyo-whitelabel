import type { AppDeliveryQuote, AppDeliveryQuoteRequest, AppErrorCode, AppOrderDelivery } from '@/lib/contract'
import type { DeliveryFeeStatus } from './blockers'
import { APP_DELIVERY_ADDRESS_MAX } from '@/lib/contract'
import { formatPeso, toCentavos } from '@/lib/money'

/** A picked place, before any quote: what the rider reads and where the pin is. */
export type PickedPlace = Pick<AppOrderDelivery, 'address' | 'lat' | 'lng'>

/** A courier quote this close to its expiry is treated as expired: the order would arrive after it. */
export const QUOTE_EXPIRY_MARGIN_MS = 30_000

export function quoteRequestFor(outletId: string | null, place: PickedPlace): AppDeliveryQuoteRequest {
  return { outletId, address: place.address, lat: place.lat, lng: place.lng }
}

/** Lalamove quotes stop being accepted at `expiresAt`; a store-priced fee never expires. */
export function isQuoteExpired(quote: Pick<AppDeliveryQuote, 'expiresAt'>, nowMs: number): boolean {
  if (quote.expiresAt === null) return false
  const expiresMs = Date.parse(quote.expiresAt)
  return Number.isNaN(expiresMs) || expiresMs - QUOTE_EXPIRY_MARGIN_MS <= nowMs
}

const meetsFreeDelivery = (quote: Pick<AppDeliveryQuote, 'freeDeliveryMinimum'>, subtotalCentavos: number) =>
  quote.freeDeliveryMinimum !== null && subtotalCentavos >= toCentavos(quote.freeDeliveryMinimum)

/** The fee to show for this bag. Display only: the order route decides the waiver on its own prices. */
export function displayedDeliveryFeeCentavos(quote: Pick<AppDeliveryQuote, 'fee' | 'freeDeliveryMinimum'>, subtotalCentavos: number): number {
  return meetsFreeDelivery(quote, subtotalCentavos) ? 0 : toCentavos(quote.fee)
}

/** "₱49 delivery · Free over ₱500 · about 35 min". */
export function quoteSummary(quote: AppDeliveryQuote, subtotalCentavos: number): string {
  const isFree = meetsFreeDelivery(quote, subtotalCentavos)
  const parts = [isFree ? 'Free delivery' : `${formatPeso(toCentavos(quote.fee))} delivery`]
  if (!isFree && quote.freeDeliveryMinimum !== null && quote.fee > 0) parts.push(`Free over ${formatPeso(toCentavos(quote.freeDeliveryMinimum))}`)
  if (quote.etaMinutes !== null) parts.push(`about ${quote.etaMinutes} min`)
  return parts.join(' · ')
}

/**
 * After re-quoting an expired courier quote just before placing: the same fee
 * goes straight on; a different one is shown first, never charged unseen.
 */
export function requoteOutcome(previous: Pick<AppDeliveryQuote, 'fee'>, next: Pick<AppDeliveryQuote, 'fee'>): 'place' | 'fee_changed' {
  return toCentavos(previous.fee) === toCentavos(next.fee) ? 'place' : 'fee_changed'
}

/** The address the rider reads: a landmark's name in front of its street address, within the contract's limit. */
export function placeToDelivery(place: { name: string | null; address: string; lat: number; lng: number }): PickedPlace {
  const name = place.name?.trim() ?? ''
  const street = place.address.trim()
  const address = name && !street.toLowerCase().startsWith(name.toLowerCase()) ? `${name}, ${street}` : street
  return { address: address.slice(0, APP_DELIVERY_ADDRESS_MAX), lat: place.lat, lng: place.lng }
}

interface FeeStatusInput {
  hasQuote: boolean
  isFetching: boolean
  /** The quote's failure code; null when it did not fail. */
  errorCode: AppErrorCode | 'network' | null
}

/** Where the fee stands. `refused` = the store won't deliver there (its words travel separately). */
export function deliveryFeeStatus({ hasQuote, isFetching, errorCode }: FeeStatusInput): DeliveryFeeStatus {
  if (errorCode !== null && !isFetching) return errorCode === 'refused' ? 'refused' : 'failed'
  if (hasQuote) return 'ready'
  return 'quoting'
}
