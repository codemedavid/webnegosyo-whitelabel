/**
 * The "Open in Google Maps" link on a delivery order, for the merchant.
 *
 * The exact pin when the order has one (riders and merchants navigate with
 * Google Maps on Android); otherwise a search for the address text, so an
 * order without a pin can still be checked on a map.
 */

import { DELIVERY_ADDRESS_FIELD_NAME } from '@/lib/customer-details'
import { pinLink } from '@/lib/delivery/rider-remarks'

const SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query='

export function orderMapLink(
  customerData: Record<string, unknown> | null | undefined,
  addressText?: string | null,
): string | null {
  const data = customerData ?? {}
  const pin = pinLink(data.delivery_lat, data.delivery_lng)
  if (pin) return pin
  const stored = data[DELIVERY_ADDRESS_FIELD_NAME]
  const address = (addressText ?? (typeof stored === 'string' ? stored : '')).trim()
  return address ? `${SEARCH_URL}${encodeURIComponent(address)}` : null
}
