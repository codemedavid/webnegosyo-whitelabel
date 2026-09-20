/**
 * The curated category-icon vocabulary, kept free of React/lucide imports so
 * server code (schema validation, the MCP) can read it without pulling a
 * component library into a service module.
 *
 * Storage convention: a Lucide icon is stored as `lucide:<icon-name>`; any
 * other non-empty string is treated as a raw emoji (legacy escape hatch).
 * `src/lib/category-icons.ts` maps each curated name to its component and
 * re-exports everything here for the existing UI imports.
 */

export const LUCIDE_PREFIX = 'lucide:'

export interface IconGroup {
  label: string
  icons: string[] // Lucide icon names (without prefix)
}

export const CURATED_ICON_GROUPS: IconGroup[] = [
  {
    label: 'Popular',
    icons: [
      'utensils', 'pizza', 'coffee', 'beef', 'sandwich', 'salad',
      'ice-cream-cone', 'cake-slice', 'wine', 'beer', 'soup', 'egg-fried',
    ],
  },
  {
    label: 'Proteins & Mains',
    icons: [
      'ham', 'drumstick', 'fish', 'shrimp', 'popcorn', 'cooking-pot',
    ],
  },
  {
    label: 'Desserts & Sweets',
    icons: [
      'cake', 'cookie', 'candy', 'lollipop', 'donut', 'croissant', 'dessert',
    ],
  },
  {
    label: 'Drinks',
    icons: [
      'cup-soda', 'glass-water', 'martini', 'milk', 'citrus', 'grape', 'wine-off',
    ],
  },
  {
    label: 'Fruits & Vegetables',
    icons: [
      'apple', 'banana', 'cherry', 'carrot', 'leaf', 'wheat', 'nut', 'vegan',
    ],
  },
  {
    label: 'Restaurant & Kitchen',
    icons: [
      'chef-hat', 'flame', 'microwave', 'refrigerator', 'store', 'shopping-bag',
      'truck', 'clock', 'star', 'heart', 'thumbs-up', 'award',
    ],
  },
  {
    label: 'Labels & Dietary',
    icons: [
      'flame-kindling', 'badge-check', 'sparkles', 'zap', 'tag', 'percent', 'crown',
    ],
  },
]

/** Flat list of all curated icon names (deduplicated) */
export const ALL_CURATED_ICONS: string[] = [
  ...new Set(CURATED_ICON_GROUPS.flatMap((g) => g.icons)),
]

const CURATED_ICON_SET: ReadonlySet<string> = new Set(ALL_CURATED_ICONS)

/** Check if an icon string is a Lucide icon (vs emoji) */
export function isLucideIcon(icon: string | undefined): boolean {
  return !!icon && icon.startsWith(LUCIDE_PREFIX)
}

/** Extract the Lucide icon name from a prefixed string */
export function getLucideIconName(icon: string): string {
  return icon.slice(LUCIDE_PREFIX.length)
}

/** Create a prefixed Lucide icon string for storage */
export function toLucideIconString(name: string): string {
  return `${LUCIDE_PREFIX}${name}`
}

/**
 * True when `value` is storable as a category icon: a curated `lucide:<name>`,
 * a raw emoji/short string (legacy), or empty/undefined (no icon).
 *
 * The storefront resolves `lucide:*` through a static component map and
 * renders NOTHING for an unknown name, so an unvetted name is a silently
 * blank icon — the check exists so that failure happens at write time instead.
 */
export function isKnownCategoryIcon(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === '') return true
  if (isLucideIcon(value)) return CURATED_ICON_SET.has(getLucideIconName(value))
  // Raw emoji escape hatch: short, never something that looks like a mangled prefix.
  return value.length <= 8
}

/** Storefront icon tints are 6-digit hex. */
export const CATEGORY_ICON_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function isValidCategoryIconColor(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === '') return true
  return CATEGORY_ICON_COLOR_RE.test(value)
}
