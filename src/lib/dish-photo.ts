import type { MenuItem } from '@/types/database'

/**
 * Whether a dish has a photo of its own.
 *
 * Menu cards render a dish without one as a text card: no media frame, no
 * store-logo stand-in, no placeholder. A logo repeated on every dish (or a grid
 * of empty frames) reads as a broken menu on stores that never shot photos. A
 * blank or whitespace-only url is no photo. Pure, so any card or layout can ask.
 */
export function hasDishPhoto(item: Pick<MenuItem, 'image_url'>): boolean {
  return typeof item.image_url === 'string' && item.image_url.trim().length > 0
}

/** The merchandising label a card shows: the merchant's badge text, else Featured. */
export function dishBadgeLabel(
  item: Pick<MenuItem, 'badge_text' | 'is_featured'>,
  menuEngineeringEnabled?: boolean,
): string | null {
  if (menuEngineeringEnabled && item.badge_text) return item.badge_text
  return item.is_featured ? 'Featured' : null
}
