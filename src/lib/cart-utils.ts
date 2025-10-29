import type { CartItem, Variation, Addon } from '@/types/database'

/**
 * Calculate the subtotal for a cart item including variations and add-ons
 */
export function calculateCartItemSubtotal(
  basePrice: number,
  variation: Variation | undefined,
  addons: Addon[],
  quantity: number
): number {
  const variationPrice = variation?.price_modifier || 0
  const addonsPrice = addons.reduce((sum, addon) => sum + addon.price, 0)
  const itemTotal = basePrice + variationPrice + addonsPrice
  return itemTotal * quantity
}

/**
 * Calculate the total price of all items in the cart
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.subtotal, 0)
}

/**
 * Get the total number of items in the cart
 */
export function getCartItemCount(items: CartItem[]): number {
  return items.reduce((count, item) => count + item.quantity, 0)
}

/**
 * Generate a unique ID for a cart item based on its configuration
 */
export function generateCartItemId(
  menuItemId: string,
  variationId?: string,
  addonIds?: string[]
): string {
  const parts = [menuItemId]
  if (variationId) parts.push(variationId)
  if (addonIds && addonIds.length > 0) {
    parts.push(addonIds.sort().join('-'))
  }
  return parts.join('_')
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(price)
}

/**
 * Generate messenger message from cart
 */
export function generateMessengerMessage(
  items: CartItem[],
  restaurantName: string,
  orderCreated: boolean = true,
  orderType?: { name: string; type: string } | null,
  customerData?: Record<string, string>
): string {
  const lines = [
    `🍽️ New Order from ${restaurantName}`,
    '',
  ]

  // Add order type information
  if (orderType) {
    const orderTypeEmoji = {
      dine_in: '🍽️',
      pickup: '📦',
      delivery: '🚚',
    }
    lines.push(`📋 Order Type: ${orderTypeEmoji[orderType.type as keyof typeof orderTypeEmoji] || '📋'} ${orderType.name}`)
    lines.push('')
  }

  // Add customer information
  if (customerData) {
    const customerInfo = []
    if (customerData.customer_name) customerInfo.push(`👤 Name: ${customerData.customer_name}`)
    if (customerData.customer_phone) customerInfo.push(`📞 Phone: ${customerData.customer_phone}`)
    if (customerData.customer_email) customerInfo.push(`📧 Email: ${customerData.customer_email}`)
    if (customerData.delivery_address) customerInfo.push(`📍 Address: ${customerData.delivery_address}`)
    if (customerData.table_number) customerInfo.push(`🪑 Table: ${customerData.table_number}`)
    
    if (customerInfo.length > 0) {
      lines.push('👤 Customer Information:')
      lines.push(...customerInfo)
      lines.push('')
    }
  }

  lines.push('📋 Order Details:')

  items.forEach((item, index) => {
    const variationText = item.selected_variation
      ? ` (${item.selected_variation.name})`
      : ''
    lines.push(`${index + 1}. ${item.menu_item.name}${variationText} x${item.quantity}`)

    if (item.selected_addons.length > 0) {
      const addonsText = item.selected_addons.map((a) => a.name).join(', ')
      lines.push(`   Add-ons: ${addonsText}`)
    }

    if (item.special_instructions) {
      lines.push(`   Special: ${item.special_instructions}`)
    }

    lines.push(`   Price: ${formatPrice(item.subtotal)}`)
    lines.push('')
  })

  const total = calculateCartTotal(items)
  lines.push(`💰 Total: ${formatPrice(total)}`)
  lines.push('')
  
  if (!orderCreated) {
    lines.push('⚠️ Note: Order was not saved to system - please create manually in admin panel')
    lines.push('')
  }
  
  lines.push('📍 Please confirm your order!')

  return lines.join('\n')
}

/**
 * Generate messenger URL with prefilled message
 */
export function generateMessengerUrl(
  pageIdOrUsername: string,
  message: string,
  usePageId = false
): string {
  const encodedMessage = encodeURIComponent(message)
  if (usePageId) {
    return `https://m.me/${pageIdOrUsername}?text=${encodedMessage}`
  }
  return `https://m.me/${pageIdOrUsername}?text=${encodedMessage}`
}

