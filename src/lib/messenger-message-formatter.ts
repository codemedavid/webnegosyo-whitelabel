/**
 * Messenger Message Formatter
 * Formats order details into a message for sending via Messenger
 */

import type { Order, Tenant } from '@/types/database'
import { formatPrice } from './cart-utils'

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

  // Add totals
  lines.push(`💰 Subtotal: ${formatPrice(order.total - (order.delivery_fee || 0))}`)
  if (order.delivery_fee && order.delivery_fee > 0) {
    lines.push(`🚚 Delivery Fee: ${formatPrice(order.delivery_fee)}`)
  }
  lines.push(`💰 Total: ${formatPrice(order.total)}`)
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

