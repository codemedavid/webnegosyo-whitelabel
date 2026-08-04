/**
 * Messenger Message Formatter
 * Formats order details into a message for sending via Messenger
 */

import type { Order, Tenant } from '@/types/database'
import { formatPrice } from './cart-utils'
import { getOrderScheduledLabel } from './advance-order-utils'
import { getOrderOutletLabel } from './outlets/order-outlet-display'
import { readOrderDiscount } from './order-discount'
import { orderSummaryRows, type OrderSummaryRow } from './order-summary-rows'

/**
 * The ticket's own wording for a money row.
 *
 * `orderSummaryRows` decides WHICH rows appear and what each is worth; the
 * emoji and the capitalisation are this ticket's, unchanged from what merchants
 * already read. A discount is a magnitude, so the minus sign is added here.
 */
function formatSummaryRow(row: OrderSummaryRow): string {
  switch (row.kind) {
    case 'subtotal':
      return `💰 Subtotal: ${formatPrice(row.amount)}`
    case 'discount':
      return `🎟️ ${row.label}: -${formatPrice(row.amount)}`
    case 'delivery':
      return `🚚 Delivery Fee: ${formatPrice(row.amount)}`
    case 'total':
      return `💰 Total: ${formatPrice(row.amount)}`
  }
}

/**
 * Format order details into a message for Messenger
 */
export function formatOrderMessage(order: Order, tenant: Tenant): string {
  const lines = [
    `🍽️ New Order from ${tenant.name}`,
    '',
  ]

  // Add order type information
  if (order.order_type) {
    const orderTypeEmoji = {
      'Dine In': '🍽️',
      'Pick Up': '📦',
      'Delivery': '🚚',
    }
    const emoji = orderTypeEmoji[order.order_type as keyof typeof orderTypeEmoji] || '📋'
    lines.push(`📋 Order Type: ${emoji} ${order.order_type}`)
    lines.push('')
  }

  // Add the branch that took the order. Messenger is where most merchants
  // actually read their tickets, so a branch missing here means the kitchen
  // never learns which outlet the order was for. Absent for every
  // single-location tenant, whose message is unchanged.
  const outletLabel = getOrderOutletLabel(order)
  if (outletLabel) {
    lines.push(`🏪 Branch: ${outletLabel}`)
    lines.push('')
  }

  // Add scheduled (advance / pre-order) fulfillment time
  const scheduledLabel = getOrderScheduledLabel(order)
  if (scheduledLabel) {
    lines.push(`🗓️ Scheduled for: ${scheduledLabel}`)
    lines.push('')
  }

  // Add customer information
  if (order.customer_name || order.customer_contact) {
    lines.push('👤 Customer Information:')
    if (order.customer_name) {
      lines.push(`   👤 Name: ${order.customer_name}`)
    }
    if (order.customer_contact) {
      lines.push(`   📞 Contact: ${order.customer_contact}`)
    }
    lines.push('')
  }

  // Add customer data (from form fields)
  if (order.customer_data && typeof order.customer_data === 'object') {
    const customerData = order.customer_data as Record<string, unknown>
    const additionalInfo: string[] = []

    if (customerData.delivery_address) {
      additionalInfo.push(`📍 Address: ${customerData.delivery_address}`)
    }
    if (customerData.table_number) {
      additionalInfo.push(`🪑 Table: ${customerData.table_number}`)
    }
    if (customerData.customer_email && !order.customer_contact) {
      additionalInfo.push(`📧 Email: ${customerData.customer_email}`)
    }
    if (customerData.customer_phone && !order.customer_contact) {
      additionalInfo.push(`📱 Phone: ${customerData.customer_phone}`)
    }

    if (additionalInfo.length > 0) {
      lines.push(...additionalInfo)
      lines.push('')
    }
  }

  // Add order items
  if (order.items && order.items.length > 0) {
    lines.push('📋 Order Details:')
    lines.push('')

    order.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.menu_item_name}`)

      if (item.variation) {
        lines.push(`   Variation: ${item.variation}`)
      }

      if (item.addons && item.addons.length > 0) {
        const addonsText = Array.isArray(item.addons)
          ? item.addons.join(', ')
          : String(item.addons)
        lines.push(`   Add-ons: ${addonsText}`)
      }

      if (item.special_instructions) {
        lines.push(`   Special: ${item.special_instructions}`)
      }

      lines.push(`   Quantity: ${item.quantity}`)
      lines.push(`   Price: ${formatPrice(item.subtotal)}`)
      lines.push('')
    })
  }

  // Add totals.
  //
  // The subtotal is summed from the ITEMS, not derived as `total - delivery`.
  // `order.total` is stored net of any discount, so that derivation printed a
  // subtotal that contradicted the item lines directly above it, and no row
  // named the voucher that explained the gap. Same rules as the admin surfaces.
  const itemsSubtotal = (order.items ?? []).reduce(
    (sum, item) => sum + (Number(item.subtotal) || 0),
    0,
  )

  for (const row of orderSummaryRows({
    subtotal: itemsSubtotal,
    deliveryFee: Number(order.delivery_fee) || 0,
    discount: readOrderDiscount(order),
    total: Number(order.total),
  })) {
    lines.push(formatSummaryRow(row))
  }
  lines.push('')

  // Add payment method information
  if (order.payment_method_name) {
    lines.push('💳 Payment Method:')
    lines.push(`   ${order.payment_method_name}`)
    if (order.payment_method_details) {
      lines.push(`   ${order.payment_method_details}`)
    }
    lines.push('')
  }

  // Add order status
  lines.push(`📊 Status: ${order.status}`)
  lines.push('')
  lines.push('📍 Please confirm your order!')

  return lines.join('\n')
}

