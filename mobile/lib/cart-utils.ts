// Ported from web src/lib/cart-utils.ts — keep in sync
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
    if (typeof variationOrVariations === 'object' && !('price_modifier' in variationOrVariations)) {
      variationPrice = Object.values(variationOrVariations as { [typeId: string]: VariationOption }).reduce(
        (sum, option) => sum + option.price_modifier,
        0
      )
    } else {
      variationPrice = (variationOrVariations as Variation).price_modifier || 0
    }
  }

  const addonsPrice = addons.reduce((sum, addon) => sum + addon.price, 0)
  const itemTotal = basePrice + variationPrice + addonsPrice
  return itemTotal * quantity
}

export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.subtotal, 0)
}

export function getCartItemCount(items: CartItem[]): number {
  return items.reduce((count, item) => count + item.quantity, 0)
}

export function generateCartItemId(
  menuItemId: string,
  variationOrVariations?: string | { [typeId: string]: VariationOption },
  addonIds?: string[]
): string {
  const parts = [menuItemId]

  if (variationOrVariations) {
    if (typeof variationOrVariations === 'string') {
      parts.push(variationOrVariations)
    } else {
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

export interface FormatPriceOptions {
  hideCurrencySymbol?: boolean
}

export function formatPrice(price: number, options?: FormatPriceOptions): string {
  if (options?.hideCurrencySymbol) {
    return new Intl.NumberFormat('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(price)
}

export interface FormFieldMeta {
  field_name: string
  field_label: string
}

export function generateMessengerMessage(
  items: CartItem[],
  restaurantName: string,
  orderType?: { name: string; type: string } | null,
  customerData?: Record<string, string>,
  paymentMethod?: { name: string; details?: string } | null,
  formFields?: FormFieldMeta[],
  scheduledForLabel?: string | null
): string {
  const lines = [
    `New Order from ${restaurantName}`,
    '',
  ]

  if (orderType) {
    const orderTypeEmoji: Record<string, string> = {
      dine_in: '🍽️',
      pickup: '📦',
      delivery: '🚚',
    }
    lines.push(`Order Type: ${orderTypeEmoji[orderType.type] || '📋'} ${orderType.name}`)
    lines.push('')
  }

  // Advance order: requested fulfillment time
  if (scheduledForLabel) {
    lines.push(`🗓️ Scheduled for: ${scheduledForLabel}`)
    lines.push('')
  }

  if (customerData) {
    const customerInfo: string[] = []
    const knownFieldEmojis: Record<string, string> = {
      customer_name: '👤',
      customer_phone: '📞',
      customer_email: '📧',
      delivery_address: '📍',
      table_number: '🪑',
    }
    // Skip internal-use fields (coordinates, messenger PSID, advance-order metadata).
    const skipFields = ['delivery_lat', 'delivery_lng', 'messenger_psid', 'scheduled_for', 'scheduled_for_label']

    if (formFields && formFields.length > 0) {
      formFields.forEach(field => {
        const value = customerData[field.field_name]
        if (value && value.trim()) {
          const emoji = knownFieldEmojis[field.field_name] || '📝'
          customerInfo.push(`${emoji} ${field.field_label}: ${value}`)
        }
      })
    } else {
      Object.entries(customerData).forEach(([fieldName, value]) => {
        if (skipFields.includes(fieldName) || !value || !value.trim()) return
        const emoji = knownFieldEmojis[fieldName] || '📝'
        const label = fieldName
          .replace(/^customer_/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
        customerInfo.push(`${emoji} ${label}: ${value}`)
      })
    }

    if (customerInfo.length > 0) {
      lines.push('Customer Information:')
      lines.push(...customerInfo)
      lines.push('')
    }
  }

  lines.push('Order Details:')

  items.forEach((item, index) => {
    let variationText = ''
    if (item.selected_variations) {
      const variations = Object.entries(item.selected_variations)
        .map(([, option]) => option.name)
        .join(', ')
      variationText = variations ? ` (${variations})` : ''
    } else if (item.selected_variation) {
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
  lines.push(`Total: ${formatPrice(total)}`)
  lines.push('')

  if (paymentMethod) {
    lines.push('Payment Method:')
    lines.push(`   ${paymentMethod.name}`)
    if (paymentMethod.details) {
      lines.push(`   ${paymentMethod.details}`)
    }
    lines.push('')
  }

  lines.push('Please confirm your order!')

  return lines.join('\n')
}

export function generateMessengerUrl(
  pageIdOrUsername: string | null | undefined,
  message: string
): string | null {
  if (!pageIdOrUsername || pageIdOrUsername.trim() === '') return null
  const MAX_MESSAGE_LENGTH = 600
  let truncatedMessage = message
  if (message.length > MAX_MESSAGE_LENGTH) {
    truncatedMessage = message.substring(0, MAX_MESSAGE_LENGTH - 3) + '...'
  }
  const encodedMessage = encodeURIComponent(truncatedMessage)
  return `https://m.me/${pageIdOrUsername.trim()}?text=${encodedMessage}`
}

export function generateMessengerRefUrl(
  pageId: string | null | undefined,
  orderId: string
): string | null {
  if (!pageId || pageId.trim() === '') return null
  if (!orderId || orderId.trim() === '') return null
  const ref = `ORDER_${orderId}`
  const timestamp = Date.now()
  const uniqueRef = `${ref}_${timestamp}`
  return `https://m.me/${pageId.trim()}?ref=${encodeURIComponent(uniqueRef)}`
}

export function generateMessengerCombinedUrl(
  pageId: string | null | undefined,
  orderId: string,
  message: string
): string | null {
  if (!pageId || pageId.trim() === '') return null
  if (!orderId || orderId.trim() === '') return null

  const ref = `ORDER_${orderId}`
  const timestamp = Date.now()
  const uniqueRef = `${ref}_${timestamp}`
  const encodedRef = encodeURIComponent(uniqueRef)

  const BASE_URL_LENGTH = 40
  const REF_PARAM_LENGTH = encodedRef.length + 20
  const SAFETY_MARGIN = 50
  const MAX_TEXT_LENGTH = 2000 - BASE_URL_LENGTH - REF_PARAM_LENGTH - SAFETY_MARGIN - pageId.trim().length
  const MAX_MESSAGE_LENGTH = Math.max(400, MAX_TEXT_LENGTH - 100)

  let truncatedMessage = message
  if (message.length > MAX_MESSAGE_LENGTH) {
    truncatedMessage = message.substring(0, MAX_MESSAGE_LENGTH - 3) + '...'
  }

  const encodedMessage = encodeURIComponent(truncatedMessage)
  return `https://m.me/${pageId.trim()}?ref=${encodedRef}&text=${encodedMessage}`
}

export function generateMessengerDirectUrl(
  pageIdOrUsername: string | null | undefined
): string | null {
  if (!pageIdOrUsername || pageIdOrUsername.trim() === '') return null
  return `https://www.messenger.com/t/${pageIdOrUsername.trim()}`
}
