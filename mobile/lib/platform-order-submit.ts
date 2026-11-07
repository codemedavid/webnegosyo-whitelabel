import { classifyCustomerAppOrderResponse, type OrderSaveOutcome } from './checkout-outcome'
import { getWebAppUrl } from './web-app-url'

/**
 * Places a customer's order on the shared platform database.
 *
 * The app no longer writes `orders` / `order_items` itself (that needed the
 * anon role to be allowed to insert, which skipped pricing, stock and rate
 * limits). It posts the cart to the web API, which runs the same checks as the
 * web checkout and saves the order. Stock is spent by that route; nothing here
 * calls the separate stock-notify endpoint for a platform order.
 *
 * Never throws: a network failure is a `failed` outcome, which keeps the
 * Messenger message open as the merchant's only copy of the order.
 */

export interface PlatformOrderLine {
  menu_item_id: string
  menu_item_name: string
  variation?: string
  addons: string[]
  quantity: number
  price: number
  subtotal: number
  special_instructions?: string
  option_ids?: string[]
  addon_ids?: string[]
}

export interface PlatformOrderRequest {
  tenantId: string
  clientOrderId: string
  orderTypeId: string
  paymentMethodId?: string
  customerInfo: { name?: string; contact?: string }
  customerData: Record<string, unknown>
  scheduledForISO?: string
  paymentProof?: { url?: string; publicId?: string; reference?: string }
  items: PlatformOrderLine[]
}

export async function submitPlatformOrder(
  request: PlatformOrderRequest,
): Promise<OrderSaveOutcome> {
  try {
    const response = await fetch(`${getWebAppUrl()}/api/orders/customer-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    const body = await response.json().catch(() => null)
    return classifyCustomerAppOrderResponse(response.ok, response.status, body)
  } catch (error) {
    return classifyCustomerAppOrderResponse(false, 0, null, error)
  }
}
