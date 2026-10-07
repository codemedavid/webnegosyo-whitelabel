'use client'

/**
 * The delivery fee for the address the customer picked.
 *
 * Two mutually exclusive sources: Lalamove (when enabled — always wins) or the
 * distance-based fee (when Lalamove is off and distance delivery is set up).
 * `resolveDeliveryQuotePlan` decides which applies and why none does.
 *
 * Moved out of useCheckout. Two behavioural fixes on the way:
 *  - the effect keys on the tenant's delivery COLUMNS rather than the tenant
 *    object, whose identity changes with every Branding Studio draft and whole
 *    order-type list reloads, each of which re-requested a paid quote;
 *  - state is one immutable object, so a reset can never leave half the fields
 *    describing the previous address.
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createQuotationAction } from '@/app/actions/lalamove'
import { calculateDistanceDeliveryFeeAction } from '@/app/actions/delivery'
import { resolveDeliveryQuotePlan } from '@/lib/delivery-quote'
import type { Tenant } from '@/types/database'

export interface DeliveryQuoteState {
  deliveryFee: number | null
  quotationId: string | null
  /** The server's signature on the Lalamove price; the order action bills that. */
  quoteSignature: string | null
  /** Provider expiry, in epoch milliseconds. */
  quoteExpiresAt: number | null
  isFetchingDeliveryFee: boolean
  /** The address the fee was quoted for; a fee for any other address is stale. */
  deliveryFeeAddress: string
  /** Distance delivery: the address is outside the radius (blocks submit). */
  deliveryOutOfRange: boolean
  deliveryDistanceKm: number | null
  /** Customer-visible reason no fee could be calculated. */
  deliveryFeeError: string | null
}

export const IDLE_DELIVERY_QUOTE: DeliveryQuoteState = {
  deliveryFee: null,
  quotationId: null,
  quoteSignature: null,
  quoteExpiresAt: null,
  isFetchingDeliveryFee: false,
  deliveryFeeAddress: '',
  deliveryOutOfRange: false,
  deliveryDistanceKm: null,
  deliveryFeeError: null,
}

const FETCHING_DELIVERY_QUOTE: DeliveryQuoteState = { ...IDLE_DELIVERY_QUOTE, isFetchingDeliveryFee: true }
const EXPIRED_QUOTE_MESSAGE = 'Your delivery quote expired. Please get a new delivery quote before continuing.'

type DeliveryTenantFields = Pick<
  Tenant,
  'id' | 'lalamove_enabled' | 'distance_delivery_enabled' | 'restaurant_address' | 'restaurant_latitude' | 'restaurant_longitude'
>

export interface UseDeliveryQuoteInput {
  tenant: DeliveryTenantFields | null
  isDeliveryOrder: boolean
  deliveryAddress: string | undefined
  deliveryLat: string | undefined
  deliveryLng: string | undefined
}

interface DeliveryQuoteResult extends DeliveryQuoteState {
  retryDeliveryQuote: () => void
  /** Rechecked at submit time because suspended browser tabs delay timers. */
  getDeliveryQuoteError: () => string | null
}

function failedQuote(message: string): DeliveryQuoteState {
  return { ...IDLE_DELIVERY_QUOTE, deliveryFeeError: message }
}

async function requestQuote(
  tenant: DeliveryTenantFields,
  kind: 'lalamove' | 'distance',
  address: string,
  lat: number,
  lng: number
): Promise<DeliveryQuoteState> {
  if (kind === 'lalamove') {
    const result = await createQuotationAction(
      tenant.id,
      tenant.restaurant_address || '',
      Number(tenant.restaurant_latitude),
      Number(tenant.restaurant_longitude),
      address,
      lat,
      lng
    )
    if (!result.success || !result.data) {
      console.error('Failed to fetch delivery quote:', result.error)
      toast.error(result.error || 'Failed to get delivery fee')
      return failedQuote(result.error || 'We couldn’t get a delivery fee for this address. Please try again.')
    }
    const quoteExpiresAt = new Date(result.data.expiresAt).getTime()
    if (!result.data.quotationId || !result.data.quoteSignature || !Number.isFinite(result.data.price) || result.data.price < 0 || !Number.isFinite(quoteExpiresAt)) {
      return failedQuote('We couldn’t get a valid delivery quote. Please try again.')
    }
    if (quoteExpiresAt <= Date.now()) return failedQuote(EXPIRED_QUOTE_MESSAGE)
    return {
      ...IDLE_DELIVERY_QUOTE,
      deliveryFee: result.data.price,
      quotationId: result.data.quotationId,
      quoteSignature: result.data.quoteSignature ?? null,
      quoteExpiresAt,
      deliveryFeeAddress: address,
    }
  }

  const result = await calculateDistanceDeliveryFeeAction(tenant.id, lat, lng)
  if (!result.success || !result.data) {
    console.error('Failed to calculate delivery fee:', result.error)
    toast.error(result.error || 'Failed to get delivery fee')
    return failedQuote(result.error || 'We couldn’t calculate a delivery fee for this address. Please try again.')
  }
  if (!result.data.withinRadius) {
    toast.error(`This address is outside the delivery area (${result.data.radiusKm} km).`)
    return { ...IDLE_DELIVERY_QUOTE, deliveryOutOfRange: true, deliveryDistanceKm: result.data.distanceKm }
  }
  return {
    ...IDLE_DELIVERY_QUOTE,
    deliveryFee: result.data.fee,
    deliveryFeeAddress: address,
    deliveryDistanceKm: result.data.distanceKm,
  }
}

export function useDeliveryQuote({
  tenant,
  isDeliveryOrder,
  deliveryAddress,
  deliveryLat,
  deliveryLng,
}: UseDeliveryQuoteInput): DeliveryQuoteResult {
  const [snapshot, setSnapshot] = useState({ requestKey: '', value: IDLE_DELIVERY_QUOTE })
  const [attempt, setAttempt] = useState(0)
  const retryDeliveryQuote = useCallback(() => setAttempt(value => value + 1), [])

  const tenantId = tenant?.id
  const lalamoveEnabled = !!tenant?.lalamove_enabled
  const distanceEnabled = !!tenant?.distance_delivery_enabled
  const restaurantAddress = tenant?.restaurant_address
  const restaurantLatitude = tenant?.restaurant_latitude
  const restaurantLongitude = tenant?.restaurant_longitude
  // Invalidate during render, before effects run: the same address label may
  // describe a different map pin, and a branch/store may have moved its pickup.
  const requestKey = JSON.stringify([
    tenantId, lalamoveEnabled, distanceEnabled, restaurantAddress,
    restaurantLatitude, restaurantLongitude, isDeliveryOrder,
    deliveryAddress, deliveryLat, deliveryLng, attempt,
  ])
  const quote = snapshot.requestKey === requestKey ? snapshot.value : IDLE_DELIVERY_QUOTE

  useEffect(() => {
    if (quote.quoteExpiresAt === null) return
    const timeout = setTimeout(() => setSnapshot({ requestKey, value: failedQuote(EXPIRED_QUOTE_MESSAGE) }), Math.max(0, quote.quoteExpiresAt - Date.now()))
    return () => clearTimeout(timeout)
  }, [quote.quoteExpiresAt, requestKey])

  useEffect(() => {
    let isCancelled = false
    // An idle snapshot reads as idle under ANY request key (a key mismatch
    // already renders IDLE), so replacing idle with idle changes nothing on
    // screen — but a fresh object would re-render the whole checkout form, once
    // per keystroke while an address is typed without picking a suggestion.
    const setQuote = (value: DeliveryQuoteState) =>
      setSnapshot(previous =>
        previous.value === IDLE_DELIVERY_QUOTE && value === IDLE_DELIVERY_QUOTE ? previous : { requestKey, value }
      )

    const plan = resolveDeliveryQuotePlan({
      isDeliveryOrder,
      lalamoveEnabled,
      distanceEnabled,
      restaurantLatitude,
      restaurantLongitude,
      deliveryLatitude: deliveryLat,
      deliveryLongitude: deliveryLng,
    })

    // Delivery is on but the store's pickup coordinates were never set. The
    // customer sees `plan.message`; warn (not error) so the dev overlay stays
    // quiet for an already-handled state.
    if (plan.kind === 'misconfigured') {
      console.warn(`[Checkout] Delivery enabled for tenant ${tenantId} but restaurant coordinates are missing`)
      setQuote(failedQuote(plan.message))
      return
    }

    // Not a delivery order, no fee source enabled, or no address picked yet.
    if (plan.kind === 'idle' || plan.kind === 'awaiting-address' || !tenantId || !deliveryAddress) {
      setQuote(IDLE_DELIVERY_QUOTE)
      return
    }

    // Clear the previous address's fee at once so it is never shown as current.
    setQuote(FETCHING_DELIVERY_QUOTE)

    const tenantFields: DeliveryTenantFields = {
      id: tenantId,
      lalamove_enabled: lalamoveEnabled,
      distance_delivery_enabled: distanceEnabled,
      restaurant_address: restaurantAddress,
      restaurant_latitude: restaurantLatitude,
      restaurant_longitude: restaurantLongitude,
    }

    requestQuote(tenantFields, plan.kind, deliveryAddress, parseFloat(deliveryLat ?? ''), parseFloat(deliveryLng ?? ''))
      .then((next) => {
        // A newer address (or unmount) superseded this request: drop it.
        if (!isCancelled) setQuote(next)
      })
      .catch((error: unknown) => {
        if (isCancelled) return
        console.error('Error fetching delivery fee:', error)
        toast.error('Failed to calculate delivery fee')
        setQuote(failedQuote('We couldn’t calculate a delivery fee right now. Please try again.'))
      })

    return () => {
      isCancelled = true
    }
  }, [
    tenantId,
    lalamoveEnabled,
    distanceEnabled,
    restaurantAddress,
    restaurantLatitude,
    restaurantLongitude,
    isDeliveryOrder,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    attempt,
    requestKey,
  ])

  const getDeliveryQuoteError = (): string | null => {
    if (!isDeliveryOrder || !(lalamoveEnabled || distanceEnabled)) return null
    if (quote.deliveryFeeError) return quote.deliveryFeeError
    if (quote.deliveryOutOfRange) return 'This address is outside the delivery area. Please choose a closer address or switch to pickup.'
    if (quote.isFetchingDeliveryFee) return 'Please wait for the delivery fee before continuing.'
    if (lalamoveEnabled && quote.quoteExpiresAt !== null && quote.quoteExpiresAt <= Date.now()) return EXPIRED_QUOTE_MESSAGE
    if (
      quote.deliveryFee === null || !Number.isFinite(quote.deliveryFee) || quote.deliveryFee < 0 ||
      quote.deliveryFeeAddress !== deliveryAddress ||
      (lalamoveEnabled && (!quote.quotationId || !quote.quoteSignature || !Number.isFinite(quote.quoteExpiresAt)))
    ) return 'Please choose a delivery address and get a valid delivery quote before continuing.'
    return null
  }

  return { ...quote, retryDeliveryQuote, getDeliveryQuoteError }
}
