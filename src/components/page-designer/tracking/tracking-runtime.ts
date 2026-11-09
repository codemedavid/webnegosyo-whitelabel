// Pure helpers behind the designed tracking page: the values of its
// `{tokens}`. Server-safe.

import { formatPrice } from '@/lib/cart-utils'
import { firstNameToken } from '@/lib/page-designer/text'
import type { TrackingData } from '@/lib/order-tracking-service'

/** A name the customer actually gave (POS walk-ins are saved as "walk-in"). */
export function hasRealCustomerName(name: string | null | undefined): boolean {
  return Boolean(name && name.trim() && name.trim().toLowerCase() !== 'walk-in')
}

interface TokenSource {
  storeName: string
  data: Pick<TrackingData, 'customerName' | 'orderType' | 'total'>
  shortId: string
  /** The order's branch address, else the store's (read once on the server). */
  storeAddress?: string
}

/**
 * `{store}`, `{store_address}`, `{name}`, `{order_number}`, `{order_type}`, `{total}` — worded
 * exactly as the page prints them elsewhere ("#07" like the header, the peso
 * total like the receipt). A blank value drops the token.
 */
export function trackingTokens({ storeName, data, shortId, storeAddress = '' }: TokenSource): Record<string, string> {
  return {
    store: storeName,
    store_address: storeAddress,
    name: hasRealCustomerName(data.customerName) ? firstNameToken(data.customerName) : '',
    order_number: shortId ? `#${shortId}` : '',
    order_type: data.orderType ?? '',
    total: formatPrice(data.total),
  }
}
