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

function formatOrderMessage(data: OrderEventData): string {
  const lines: string[] = []

  lines.push(`New Order from ${data.tenantName}`)
  lines.push('')

  if (data.orderType && data.orderType !== 'unknown') {
    lines.push(`Order Type: ${data.orderType}`)
    lines.push('')
  }

  lines.push('Customer Information:')
  lines.push(`  Name: ${data.customerName ?? 'Guest'}`)
  if (data.customerContact) {
    lines.push(`  Contact: ${data.customerContact}`)
  }
  lines.push('')

  if (data.deliveryAddress) {
    lines.push(`Delivery Address: ${data.deliveryAddress}`)
    lines.push('')
  }

  lines.push('Order Details:')
  lines.push('')
  data.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`)
    if (item.variation) lines.push(`   Variation: ${item.variation}`)
    if (item.addons && item.addons.length > 0) {
      const addonNames = item.addons.map(a => typeof a === 'string' ? a : a.name)
      lines.push(`   Add-ons: ${addonNames.join(', ')}`)
    }
    lines.push(`   Qty: ${item.quantity}`)
    lines.push(`   Price: ${item.subtotal.toFixed(2)}`)
    lines.push('')
  })

  const subtotal = data.orderTotal - data.deliveryFee
  lines.push(`Subtotal: ${subtotal.toFixed(2)}`)
  if (data.deliveryFee > 0) {
    lines.push(`Delivery Fee: ${data.deliveryFee.toFixed(2)}`)
  }
  lines.push(`Total: ${data.orderTotal.toFixed(2)}`)
  lines.push('')

  if (data.paymentMethod && data.paymentMethod !== 'Not specified') {
    lines.push(`Payment: ${data.paymentMethod}`)
    lines.push('')
  }

  lines.push(`Order ID: ${data.orderId}`)

  return lines.join('\n')
}

export async function captureOrderCreated(data: OrderEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `tenant_${data.tenantId}`,
      event: 'order_created',
      properties: {
        order_message: formatOrderMessage(data),
        tenant_name: data.tenantName,
        order_id: data.orderId,
        customer_name: data.customerName ?? 'Guest',
        order_total: data.orderTotal.toFixed(2),
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
