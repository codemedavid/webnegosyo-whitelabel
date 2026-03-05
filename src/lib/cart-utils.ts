import type { CartItem, Variation, Addon, VariationOption, CartBundleItem, Bundle, BundleItemCustomization } from '@/types/database'

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
  return Math.round(itemTotal * quantity * 100) / 100
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
export interface FormatPriceOptions {
  hideCurrencySymbol?: boolean
}

// Cache Intl.NumberFormat instances — constructing them is expensive
const _phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

const _numberFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrice(price: number, options?: FormatPriceOptions): string {
  if (options?.hideCurrencySymbol) {
    return _numberFormatter.format(price)
  }
  return _phpFormatter.format(price)
}

/**
 * Form field metadata for message generation
 */
export interface FormFieldMeta {
  field_name: string
  field_label: string
}

/**
 * Generate messenger message from cart
 */
export function generateMessengerMessage(
  items: CartItem[],
  restaurantName: string,
  orderType?: { name: string; type: string } | null,
  customerData?: Record<string, string>,
  paymentMethod?: { name: string; details?: string } | null,
  formFields?: FormFieldMeta[]
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

  // Add customer information (including all custom form fields)
  if (customerData) {
    const customerInfo: string[] = []

    // Known fields with specific emojis
    const knownFieldEmojis: Record<string, string> = {
      customer_name: '👤',
      customer_phone: '📞',
      customer_email: '📧',
      delivery_address: '📍',
      table_number: '🪑',
    }

    // Fields to skip (internal use only, like coordinates)
    const skipFields = ['delivery_lat', 'delivery_lng', 'messenger_psid']

    // If we have form field metadata, use it to maintain order and get proper labels
    if (formFields && formFields.length > 0) {
      formFields.forEach(field => {
        const value = customerData[field.field_name]
        if (value && value.trim()) {
          const emoji = knownFieldEmojis[field.field_name] || '📝'
          customerInfo.push(`${emoji} ${field.field_label}: ${value}`)
        }
      })
    } else {
      // Fallback: iterate through customerData directly
      Object.entries(customerData).forEach(([fieldName, value]) => {
        if (skipFields.includes(fieldName) || !value || !value.trim()) return

        const emoji = knownFieldEmojis[fieldName] || '📝'
        // Format field name as label (e.g., 'customer_name' -> 'Name')
        const label = fieldName
          .replace(/^customer_/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
        customerInfo.push(`${emoji} ${label}: ${value}`)
      })
    }

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
  return `https://m.me/${pageIdOrUsername.trim()}?text=${encodedMessage}`
}

/**
 * Generate messenger URL with ref parameter for order tracking
 * Used for ref-based integration where webhook sends order message
 * 
 * @param pageId - Facebook Page ID
 * @param orderId - Order ID (will be prefixed with ORDER_)
 * @returns Messenger URL with ref parameter, or null if pageId is invalid
 */
export function generateMessengerRefUrl(
  pageId: string | null | undefined,
  orderId: string
): string | null {
  // Validate input
  if (!pageId || pageId.trim() === '') {
    return null
  }

  if (!orderId || orderId.trim() === '') {
    return null
  }

  const ref = `ORDER_${orderId}`
  // Use m.me format - Facebook will redirect to messenger.com/t/ but ref should be preserved
  // The ref parameter triggers a referral event when user clicks the link
  // This is considered "user interaction" by Facebook, so we can send the message immediately
  // Adding timestamp to make ref unique each time (helps trigger referral events even for existing conversations)
  // Adding source=SHORTLINK helps ensure referral events fire
  const timestamp = Date.now()
  const uniqueRef = `${ref}_${timestamp}`
  return `https://m.me/${pageId.trim()}?ref=${encodeURIComponent(uniqueRef)}`
}

/**
 * Generate messenger URL with both ref and text parameters
 * Combines ref-based tracking (for webhook) with pre-filled message (for new users)
 * 
 * This ensures:
 * - Existing users (with PSID): Webhook can send message via ref, user also sees pre-filled text
 * - New users (no PSID): User sees pre-filled text message, ref helps track when they first message
 * 
 * Facebook Messenger supports both parameters simultaneously:
 * https://m.me/{pageId}?ref={orderId}&text={message}
 * 
 * @param pageId - Facebook Page ID
 * @param orderId - Order ID (will be prefixed with ORDER_)
 * @param message - Message to pre-fill (will be truncated if too long)
 * @returns Messenger URL with both ref and text parameters, or null if inputs are invalid
 */
export function generateMessengerCombinedUrl(
  pageId: string | null | undefined,
  orderId: string,
  message: string
): string | null {
  // Validate input
  if (!pageId || pageId.trim() === '') {
    return null
  }

  if (!orderId || orderId.trim() === '') {
    return null
  }

  // Generate ref parameter (same as generateMessengerRefUrl)
  const ref = `ORDER_${orderId}`
  const timestamp = Date.now()
  const uniqueRef = `${ref}_${timestamp}`
  const encodedRef = encodeURIComponent(uniqueRef)

  // Calculate available space for message
  // Base URL: ~20 chars (https://m.me/{pageId}?)
  // Ref parameter: ~50-100 chars (ref={encodedRef}&source=SHORTLINK&)
  // Total limit: ~2000 chars
  // Reserve space for ref and other params, leaving room for text
  const BASE_URL_LENGTH = 20
  const REF_PARAM_LENGTH = encodedRef.length + 20 // ref=...&source=SHORTLINK&
  const SAFETY_MARGIN = 50 // Buffer for URL encoding overhead
  const MAX_TEXT_LENGTH = 2000 - BASE_URL_LENGTH - REF_PARAM_LENGTH - SAFETY_MARGIN - pageId.trim().length

  // Truncate message if too long (conservative limit)
  const MAX_MESSAGE_LENGTH = Math.max(400, MAX_TEXT_LENGTH - 100) // Ensure we have room
  let truncatedMessage = message
  if (message.length > MAX_MESSAGE_LENGTH) {
    truncatedMessage = message.substring(0, MAX_MESSAGE_LENGTH - 3) + '...'
  }

  const encodedMessage = encodeURIComponent(truncatedMessage)

  // Combine both parameters
  // Format: https://m.me/{pageId}?ref={ref}&source=SHORTLINK&text={message}
  return `https://m.me/${pageId.trim()}?ref=${encodedRef}&text=${encodedMessage}`
}

/**
 * Generate a direct messenger conversation URL (messenger.com/t/{pageId})
 * Used when admin prefers simple redirect without webhook/ref tracking
 * 
 * This opens Messenger directly without triggering webhook events.
 * Note: messenger.com/t links do NOT support pre-filled messages via ?text parameter.
 * If message pre-fill is needed, consider using m.me links or displaying the message
 * on the webpage for users to copy, or use webhook-based integration with ?ref parameter.
 * 
 * @param pageIdOrUsername - Facebook Page ID or username
 * @returns Direct messenger conversation URL, or null if pageIdOrUsername is invalid
 */
export function generateMessengerDirectUrl(
  pageIdOrUsername: string | null | undefined
): string | null {
  // Validate input
  if (!pageIdOrUsername || pageIdOrUsername.trim() === '') {
    return null
  }

  return `https://www.messenger.com/t/${pageIdOrUsername.trim()}`
}

/**
 * Calculate the base price of a bundle (before customization extras)
 */
export function calculateBundleBasePrice(bundle: Bundle, itemsOriginalTotal: number): number {
  if (bundle.pricing_type === 'fixed') {
    return bundle.fixed_price ?? 0
  }
  const discountPercent = Math.min(bundle.discount_percent ?? 0, 100)
  const discountMultiplier = 1 - (discountPercent / 100)
  return Math.max(0, Math.round(itemsOriginalTotal * discountMultiplier * 100) / 100)
}

/**
 * Calculate the original total of items in a bundle (sum of individual prices * quantities)
 */
export function calculateBundleOriginalTotal(customizations: BundleItemCustomization[]): number {
  return customizations.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0)
}

/**
 * Calculate extras cost (variation modifiers + addons) across all items in a bundle
 */
export function calculateBundleExtras(customizations: BundleItemCustomization[]): number {
  return customizations.reduce((sum, c) => {
    let variationExtra = 0
    if (c.selected_variations) {
      variationExtra = Object.values(c.selected_variations).reduce(
        (s, opt) => s + opt.price_modifier, 0
      )
    } else if (c.selected_variation) {
      variationExtra = c.selected_variation.price_modifier || 0
    }
    const addonExtra = c.selected_addons.reduce((s, a) => s + a.price, 0)
    return sum + (variationExtra + addonExtra) * c.quantity
  }, 0)
}

/**
 * Calculate the full subtotal for a cart bundle item
 */
export function calculateBundleSubtotal(bundleItem: CartBundleItem): number {
  const originalTotal = calculateBundleOriginalTotal(bundleItem.customizations)
  const basePrice = calculateBundleBasePrice(bundleItem.bundle, originalTotal)
  const extras = calculateBundleExtras(bundleItem.customizations)
  return (basePrice + extras) * bundleItem.quantity
}

/**
 * Calculate savings from a bundle
 */
export function calculateBundleSavings(bundle: Bundle, customizations: BundleItemCustomization[]): number {
  const originalTotal = calculateBundleOriginalTotal(customizations)
  const basePrice = calculateBundleBasePrice(bundle, originalTotal)
  return Math.max(0, originalTotal - basePrice)
}

/**
 * Calculate cart total including both regular items and bundles
 */
export function calculateFullCartTotal(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const itemsTotal = items.reduce((total, item) => total + item.subtotal, 0)
  const bundlesTotal = bundleItems.reduce((total, bi) => total + bi.subtotal, 0)
  return Math.round((itemsTotal + bundlesTotal) * 100) / 100
}

/**
 * Get total item count including bundles
 */
export function getFullCartItemCount(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const regularCount = items.reduce((count, item) => count + item.quantity, 0)
  const bundleCount = bundleItems.reduce((count, bi) => {
    const itemsInBundle = bi.customizations.reduce((s, c) => s + c.quantity, 0)
    return count + itemsInBundle * bi.quantity
  }, 0)
  return regularCount + bundleCount
}

/**
 * Get total bundle savings across all bundles in cart
 */
export function calculateTotalBundleSavings(bundleItems: CartBundleItem[]): number {
  return bundleItems.reduce((total, bi) => {
    return total + calculateBundleSavings(bi.bundle, bi.customizations) * bi.quantity
  }, 0)
}
