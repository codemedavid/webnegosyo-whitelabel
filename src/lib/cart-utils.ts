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
 * 
 * Facebook Messenger URLs have a practical limit of ~2000 characters total.
 * The base URL is ~20 chars, so message should be limited to ~1900 chars before encoding.
 * After encoding, special characters take 3 chars (e.g., %20 for space).
 * 
 * @param pageIdOrUsername - Facebook Page ID or username
 * @param message - Message to pre-fill (will be truncated if too long)
 * @returns Messenger URL with encoded message, or null if pageIdOrUsername is invalid
 */
export function generateMessengerUrl(
  pageIdOrUsername: string | null | undefined,
  message: string
): string | null {
  // Validate input
  if (!pageIdOrUsername || pageIdOrUsername.trim() === '') {
    return null
  }

  // Facebook Messenger URL limit is approximately 2000 characters
  // Base URL: ~20 chars, leaving ~1900 for encoded message
  // Account for encoding overhead (worst case: 3 chars per character)
  const MAX_MESSAGE_LENGTH = 600 // Conservative limit to ensure URL stays under 2000 chars
  
  // Truncate message if too long
  let truncatedMessage = message
  if (message.length > MAX_MESSAGE_LENGTH) {
    truncatedMessage = message.substring(0, MAX_MESSAGE_LENGTH - 3) + '...'
  }

  const encodedMessage = encodeURIComponent(truncatedMessage)
  // Use ?text= parameter for pre-filled message
  // Note: This works on desktop browsers and some mobile browsers
  const url = `https://m.me/${pageIdOrUsername.trim()}?text=${encodedMessage}`
  
  // Debug: Log URL length to ensure it's within limits
  if (url.length > 2000) {
    console.warn(`Messenger URL is ${url.length} characters, may exceed limits`)
  }
  
  return url
}

/**
 * Share message to Messenger using Web Share API
 * 
 * Uses Web Share API to share text - when user selects Messenger from share sheet,
 * the text will be pre-filled in their message box.
 * 
 * Falls back to URL redirect only if Web Share API is not available.
 * 
 * @param pageIdOrUsername - Facebook Page ID or username
 * @param message - Message to pre-fill
 * @param messengerUrl - Pre-generated Messenger URL (for fallback only)
 * @returns Promise that resolves when share is initiated
 */
export async function shareToMessenger(
  pageIdOrUsername: string | null | undefined,
  message: string,
  messengerUrl: string | null
): Promise<void> {
  // Validate inputs
  if (!messengerUrl) {
    throw new Error('Messenger URL is required')
  }

  // Primary method: Use Web Share API (works on mobile and some desktop browsers)
  // When user selects Messenger from share sheet, the text will be pre-filled
  if (navigator.share) {
    try {
      // Get base page URL to include in message so user knows where to send
      const basePageUrl = messengerUrl.split('?')[0]
      const messageWithLink = `${message}\n\n${basePageUrl}`
      
      // Share the message text - this will be pre-filled when Messenger is selected
      await navigator.share({
        text: messageWithLink,
      })
      // Success - Web Share API handled it
      return
    } catch (error) {
      // User cancelled share - don't redirect, just return
      if ((error as Error).name === 'AbortError') {
        throw error
      }
      // Other error - log and fall through to URL redirect
      console.warn('Web Share API error, falling back to URL redirect:', error)
    }
  }

  // Fallback: Direct URL redirect (only if Web Share API not available)
  // Note: ?text= parameter may not work reliably due to Facebook policies
  try {
    window.location.href = messengerUrl
  } catch (redirectError) {
    console.error('Redirect error:', redirectError)
    throw new Error('Unable to open Messenger. Please try again.')
  }
}

