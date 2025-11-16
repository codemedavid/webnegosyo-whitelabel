/**
 * Messenger Bot Utility Functions
 */

/**
 * Format price for display in Philippine Peso
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(price)
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Get order type emoji
 */
export function getOrderTypeEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    dine_in: '🍽️',
    pickup: '📦',
    delivery: '🚚',
  }
  return emojiMap[type] || '📋'
}

/**
 * Calculate cart total
 */
export function calculateCartTotal(items: Array<{ price: number; quantity: number }>): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0)
}

/**
 * Validate if a string is a valid URL
 * Facebook requires image_url to be a valid absolute URL (http:// or https://)
 */
export function isValidUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return false
  }

  try {
    const parsed = new URL(url)
    // Must be http or https
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

