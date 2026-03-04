import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let initialized = false

export function getPostHogClient(): PostHog | null {
  if (initialized) return client

  const apiKey = process.env.POSTHOG_API_KEY
  const host = process.env.POSTHOG_HOST

  if (!apiKey || !host) {
    initialized = true
    return null
  }

  client = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 })
  initialized = true
  return client
}

export interface OrderEventData {
  tenantId: string
  tenantName: string
  tenantSlug: string
  adminEmail: string
  orderId: string
  customerName: string | undefined
  customerContact: string | undefined
  items: Array<{
    name: string
    quantity: number
    variation: string | null | undefined
    addons: string[] | { name: string; price: number }[]
    subtotal: number
  }>
  orderTotal: number
  deliveryFee: number
  orderType: string | null | undefined
  paymentMethod: string | null | undefined
  deliveryAddress: string | null | undefined
}

function formatItemsSummary(items: OrderEventData['items']): string {
  return items.map(item => {
    let line = `${item.quantity}x ${item.name}`
    if (item.variation) line += ` (${item.variation})`
    if (item.addons && item.addons.length > 0) {
      const addonNames = item.addons.map(a => typeof a === 'string' ? a : a.name)
      line += ` + ${addonNames.join(', ')}`
    }
    line += ` — ${item.subtotal.toFixed(2)}`
    return line
  }).join('\n')
}

export async function captureOrderCreated(data: OrderEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `tenant_${data.tenantId}`,
      event: 'order_created',
      properties: {
        tenant_name: data.tenantName,
        tenant_slug: data.tenantSlug,
        order_id: data.orderId,
        customer_name: data.customerName ?? 'Guest',
        customer_contact: data.customerContact ?? '',
        items_summary: formatItemsSummary(data.items),
        item_count: data.items.reduce((sum, i) => sum + i.quantity, 0),
        order_total: data.orderTotal.toFixed(2),
        delivery_fee: data.deliveryFee.toFixed(2),
        order_type: data.orderType ?? 'unknown',
        payment_method: data.paymentMethod ?? 'Not specified',
        delivery_address: data.deliveryAddress ?? '',
        $set: {
          email: data.adminEmail,
          name: data.tenantName,
        },
      },
    })
  } catch (error) {
    // Fire-and-forget: log but never block the order flow
    console.error('[PostHog] Failed to capture order_created event:', error)
  }
}
