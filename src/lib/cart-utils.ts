import type { CartItem, MenuItem, Variation, Addon, VariationOption, CartBundleItem } from '@/types/database'

/** Maximum quantity allowed for a single cart line item. */
export const MAX_CART_ITEM_QUANTITY = 99

/**
 * The price a customer actually pays for one unit of a menu item, before
 * variation modifiers and add-ons.
 *
 * `discounted_price` is the merchant's sale price. It only applies when it is a
 * positive number strictly below the list price — the same rule the storefront
 * cards and the product detail page use to decide whether to render a struck-out
 * price. Every money path (cart subtotal, order line price) MUST go through
 * here, otherwise the customer sees the sale price but is charged list price.
 */
export function getEffectiveItemPrice(
  menuItem: Pick<MenuItem, 'price'> & { discounted_price?: number | null }
): number {
  const discounted = menuItem.discounted_price
  if (typeof discounted === 'number' && discounted > 0 && discounted < menuItem.price) {
    return discounted
  }
  return menuItem.price
}

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
 * Per-unit price of a configured line: base + variation modifiers + add-ons.
 *
 * This is the `price` stored on an order item. It MUST include add-ons: the
 * server enforces `subtotal = price × quantity` and recomputes the order total
 * from those subtotals, so any modifier missing here is silently deleted from
 * the customer's total.
 */
export function calculateCartItemUnitPrice(
  basePrice: number,
  variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
  addons: Addon[]
): number {
  return calculateCartItemSubtotal(basePrice, variationOrVariations, addons, 1)
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
 * Build a fully-formed CartItem from a menu item and the customer's selections.
 *
 * Centralizes cart-item construction (id + subtotal + variation-format
 * detection) so both "add to cart" and "edit cart item" share one code path and
 * never drift. Prices the line at the item's effective (sale-aware) price.
 */
export function makeCartItem(
  menuItem: MenuItem,
  variationOrVariations: Variation | { [typeId: string]: VariationOption } | undefined,
  addons: Addon[],
  quantity: number,
  specialInstructions?: string,
  upsell?: { upsellSource?: CartItem['upsellSource']; upsellSourceItemId?: string }
): CartItem {
  const isNewFormat =
    !!variationOrVariations &&
    typeof variationOrVariations === 'object' &&
    !('price_modifier' in variationOrVariations)

  const cartItemId = isNewFormat
    ? generateCartItemId(
        menuItem.id,
        variationOrVariations as { [typeId: string]: VariationOption },
        addons.map((a) => a.id)
      )
    : generateCartItemId(menuItem.id, (variationOrVariations as Variation | undefined)?.id, addons.map((a) => a.id))

  const subtotal = calculateCartItemSubtotal(
    getEffectiveItemPrice(menuItem),
    variationOrVariations,
    addons,
    quantity
  )

  return {
    id: cartItemId,
    menu_item: menuItem,
    ...(isNewFormat
      ? { selected_variations: variationOrVariations as { [typeId: string]: VariationOption } }
      : { selected_variation: variationOrVariations as Variation | undefined }),
    selected_addons: addons,
    quantity,
    special_instructions: specialInstructions,
    subtotal,
    ...(upsell?.upsellSource
      ? { upsellSource: upsell.upsellSource, upsellSourceItemId: upsell.upsellSourceItemId }
      : {}),
  }
}

/**
 * Immutably replace one cart line item with an edited configuration.
 *
 * This powers "edit item" from the cart (e.g. changing the flavor of just one
 * of two same-product lines). Behavior:
 * - If `oldCartItemId` is not in the cart, the array is returned unchanged.
 * - If the edited configuration collides with a *different* existing line (same
 *   id), the two lines are merged and their quantities summed (clamped to
 *   `maxQuantity`); the old line is dropped.
 * - Otherwise the edited item replaces the old one in place, preserving order.
 */
export function replaceCartItem(
  items: CartItem[],
  oldCartItemId: string,
  newItem: CartItem,
  maxQuantity: number = MAX_CART_ITEM_QUANTITY
): CartItem[] {
  const oldIndex = items.findIndex((item) => item.id === oldCartItemId)
  if (oldIndex === -1) return items

  const collisionIndex = items.findIndex((item, idx) => idx !== oldIndex && item.id === newItem.id)

  if (collisionIndex !== -1) {
    const target = items[collisionIndex]
    const mergedQuantity = Math.min(target.quantity + newItem.quantity, maxQuantity)
    const mergedVariations = target.selected_variations || target.selected_variation
    const mergedSubtotal = calculateCartItemSubtotal(
      getEffectiveItemPrice(target.menu_item),
      mergedVariations,
      target.selected_addons,
      mergedQuantity
    )
    const merged: CartItem = { ...target, quantity: mergedQuantity, subtotal: mergedSubtotal }

    return items
      .filter((_, idx) => idx !== oldIndex)
      .map((item) => (item.id === newItem.id ? merged : item))
  }

  return items.map((item, idx) => (idx === oldIndex ? newItem : item))
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
  formFields?: FormFieldMeta[],
  serviceChargeAmount?: number,
  scheduledForLabel?: string | null
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

  // Advance order: requested fulfillment time
  if (scheduledForLabel) {
    lines.push(`🗓️ Scheduled for: ${scheduledForLabel}`)
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

    // Fields to skip (internal use only, like coordinates and advance-order metadata)
    const skipFields = ['delivery_lat', 'delivery_lng', 'messenger_psid', 'scheduled_for', 'scheduled_for_label']

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

  if (serviceChargeAmount && serviceChargeAmount > 0) {
    lines.push(`📋 Service Charge: ${formatPrice(serviceChargeAmount)}`)
  }

  const grandTotal = total + (serviceChargeAmount ?? 0)
  lines.push(`💰 Total: ${formatPrice(grandTotal)}`)
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
 * Decide whether the checkout flow should automatically redirect the customer
 * to Messenger after an order is placed.
 *
 * Controlled per-tenant via the `messenger_redirect_enabled` flag. The default
 * is ON: any tenant where the flag is undefined or null (e.g. rows created
 * before the column existed) keeps the historical auto-redirect behavior. Only
 * an explicit `false` turns the redirect off.
 *
 * @param tenant - Tenant (or partial) carrying the redirect flag; may be null/undefined
 * @returns true when the automatic Messenger redirect should fire
 */
export function isMessengerRedirectEnabled(
  tenant: { messenger_redirect_enabled?: boolean | null } | null | undefined
): boolean {
  return tenant?.messenger_redirect_enabled !== false
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
 * A checkout cart is empty only when it has neither regular items nor bundles.
 * The checkout empty-guard must use this instead of `items.length === 0`,
 * otherwise a bundle-only cart (empty `items`) bounces the customer to the menu.
 */
export function isCheckoutCartEmpty(items: CartItem[], bundleItems: CartBundleItem[]): boolean {
  return items.length === 0 && bundleItems.length === 0
}

/**
 * Get total item count including bundles (uses new slot-based CartBundleItem shape)
 */
export function getFullCartItemCount(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const regularCount = items.reduce((count, item) => count + item.quantity, 0)
  const bundleCount = bundleItems.reduce((count, bi) => {
    const itemsInBundle = bi.slots.reduce((s, slot) => s + slot.quantity, 0)
    return count + itemsInBundle * bi.quantity
  }, 0)
  return regularCount + bundleCount
}

// ---- Slot-based bundle pricing (re-exported from dedicated module) ----
export {
  calculateSlotBundleBasePrice,
  calculateSlotBundleExtras,
  calculateSlotBundleSubtotal,
  calculateSlotBundleSavings,
  calculateTotalSlotBundleSavings,
} from '@/lib/bundle-pricing'
