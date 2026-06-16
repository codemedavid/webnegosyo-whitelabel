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
  customerData: Record<string, unknown> | null | undefined
}

function snakeToLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function buildCustomerText(customerData: Record<string, unknown> | null | undefined): string {
  if (!customerData) return 'Guest'
  const skipKeys = ['messenger_psid', 'delivery_lat', 'delivery_lng']
  const parts: string[] = []
  for (const [key, value] of Object.entries(customerData)) {
    if (skipKeys.includes(key) || !value) continue
    parts.push(`${snakeToLabel(key)}: ${String(value)}`)
  }
  return parts.length > 0 ? parts.join('|||') : 'Guest'
}

function buildItemsList(items: OrderEventData['items']): string {
  return items
    .map((item, i) => {
      let text = `${i + 1}. ${item.name} ×${item.quantity} — ₱${item.subtotal.toFixed(2)}`
      if (item.variation) text += ` (${item.variation})`
      if (item.addons && item.addons.length > 0) {
        const names = item.addons.map(a => typeof a === 'string' ? a : a.name)
        text += ` + ${names.join(', ')}`
      }
      return text
    })
    .join('|||')
}

export async function captureOrderCreated(data: OrderEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    const subtotal = data.orderTotal - data.deliveryFee
    posthog.capture({
      distinctId: `tenant_${data.tenantId}`,
      event: 'order_created',
      properties: {
        tenant_name: data.tenantName,
        order_id: data.orderId,
        order_type: (data.orderType && data.orderType !== 'unknown') ? data.orderType : '',
        customer_info: buildCustomerText(data.customerData),
        items_list: buildItemsList(data.items),
        item_count: String(data.items.reduce((sum, i) => sum + i.quantity, 0)),
        subtotal: `₱${subtotal.toFixed(2)}`,
        delivery_fee: data.deliveryFee > 0 ? `₱${data.deliveryFee.toFixed(2)}` : '',
        order_total: `₱${data.orderTotal.toFixed(2)}`,
        payment_method: (data.paymentMethod && data.paymentMethod !== 'Not specified') ? data.paymentMethod : '',
        $set: {
          email: data.adminEmail,
          name: data.tenantName,
        },
      },
    })
    await posthog.flush()
  } catch (error) {
    console.error('[PostHog] Failed to capture order_created event:', error)
  }
}

export interface CheckoutLeadEventData {
  name: string
  email: string
  phone: string
  businessName: string
  referenceNumber: string
  amount: number
}

export async function captureCheckoutLeadCreated(data: CheckoutLeadEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `lead_${data.referenceNumber}`,
      event: 'checkout_lead_created',
      properties: {
        reference_number: data.referenceNumber,
        business_name: data.businessName,
        amount: `₱${data.amount.toFixed(2)}`,
      },
    })
    await posthog.flush()
  } catch (error) {
    console.error('[PostHog] Failed to capture checkout_lead_created event:', error)
  }
}

export interface BookingEventData {
  name: string
  email: string
  phone: string
  bookingDate: string
  bookingTime: string
  leadId: string
  source: string
}

export async function captureBookingCreated(data: BookingEventData): Promise<void> {
  const posthog = getPostHogClient()
  if (!posthog) return

  try {
    posthog.capture({
      distinctId: `lead_${data.email}`,
      event: 'booking_created',
      properties: {
        lead_id: data.leadId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        booking_date: data.bookingDate,
        booking_time: data.bookingTime,
        source: data.source,
        $set: {
          email: data.email,
          name: data.name,
        },
      },
    })
    await posthog.flush()
  } catch (error) {
    console.error('[PostHog] Failed to capture booking_created event:', error)
  }
}
