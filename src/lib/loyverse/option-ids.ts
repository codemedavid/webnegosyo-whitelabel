/**
 * The deterministic local ids the catalog sync writes into
 * menu_items.modifier_groups, and the parsers receipt building uses to read
 * the Loyverse identity back out of them.
 *
 * LOAD-BEARING: orders record these ids (and the merchant app routes POS
 * selections on the `lv-` / `lvm-` prefixes), so renaming a prefix orphans
 * every synced menu. The app keeps its own copy of the two prefixes in
 * webnegosyo-app/lib/loyverse-notify.ts — change both or neither.
 */

export const VARIANT_OPTION_PREFIX = 'lv-'
export const MODIFIER_OPTION_PREFIX = 'lvm-'

const VARIANT_GROUP_PREFIX = 'lv-group-'
const MODIFIER_GROUP_PREFIX = 'lvm-group-'

export const variantOptionId = (variantId: string): string => `${VARIANT_OPTION_PREFIX}${variantId}`
export const modifierOptionId = (optionId: string): string => `${MODIFIER_OPTION_PREFIX}${optionId}`
export const variantGroupId = (itemId: string): string => `${VARIANT_GROUP_PREFIX}${itemId}`
export const modifierGroupId = (modifierId: string): string => `${MODIFIER_GROUP_PREFIX}${modifierId}`

/** The Loyverse variant id an option id names, or null (groups and modifiers included). */
export function parseVariantOptionId(id: string): string | null {
  if (!id.startsWith(VARIANT_OPTION_PREFIX) || id.startsWith(VARIANT_GROUP_PREFIX)) return null
  return id.slice(VARIANT_OPTION_PREFIX.length) || null
}

/** The Loyverse modifier-option id an option id names, or null. */
export function parseModifierOptionId(id: string): string | null {
  if (!id.startsWith(MODIFIER_OPTION_PREFIX) || id.startsWith(MODIFIER_GROUP_PREFIX)) return null
  return id.slice(MODIFIER_OPTION_PREFIX.length) || null
}
