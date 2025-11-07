import type { CartItem, Variation, Addon, VariationOption } from '@/types/database'

/**
 * Calculate the subtotal for a cart item including variations and add-ons
 * Supports both new grouped variations and legacy single variation
 */
export function calculateCartItemSubtotal(
  basePrice: number,
  variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
  addons: Addon[],
  quantity: number
): number {
  let variationPrice = 0
  
  if (variationOrVariations) {
    // Check if it's the new grouped variations format
    if (typeof variationOrVariations === 'object' && !('price_modifier' in variationOrVariations)) {
      // New format: sum all variation modifiers
      variationPrice = Object.values(variationOrVariations as { [typeId: string]: VariationOption }).reduce(
        (sum, option) => sum + option.price_modifier,
        0
      )
    } else {
      // Legacy format: single variation
      variationPrice = (variationOrVariations as Variation).price_modifier || 0
    }
  }
  
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
 * Supports both new grouped variations and legacy single variation
 */
export function generateCartItemId(
  menuItemId: string,
  variationOrVariations?: string | { [typeId: string]: VariationOption },
  addonIds?: string[]
): string {
  const parts = [menuItemId]
  
  if (variationOrVariations) {
    if (typeof variationOrVariations === 'string') {
      // Legacy format: single variation ID
      parts.push(variationOrVariations)
    } else {
      // New format: map of type ID -> option
      // Sort by type ID for consistency
      const sortedTypeIds = Object.keys(variationOrVariations).sort()
      sortedTypeIds.forEach(typeId => {
        const option = variationOrVariations[typeId]
        parts.push(`${typeId}:${option.id}`)
      })
    }
  }
  
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
  customerData?: Record<string, string>,
  paymentMethod?: { name: string; details?: string } | null
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
    // Handle both new and legacy variation formats
    let variationText = ''
    if (item.selected_variations) {
      // New format: multiple variations
      const variations = Object.entries(item.selected_variations)
        .map(([, option]) => option.name)
        .join(', ')
      variationText = variations ? ` (${variations})` : ''
    } else if (item.selected_variation) {
      // Legacy format: single variation
      variationText = ` (${item.selected_variation.name})`
    }
    
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

  // Add payment method information
  if (paymentMethod) {
    lines.push('💳 Payment Method:')
    lines.push(`   ${paymentMethod.name}`)
    if (paymentMethod.details) {
      lines.push(`   ${paymentMethod.details}`)
    }
    lines.push('')
  }
  
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

