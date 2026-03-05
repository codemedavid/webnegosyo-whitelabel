/**
 * Curated icon library for restaurant/food categories.
 * Icons are stored as "lucide:<icon-name>" in the database.
 * Existing emoji values are preserved for backward compatibility.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Utensils, Pizza, Coffee, Beef, Sandwich, Salad, IceCreamCone, CakeSlice,
  Wine, Beer, Soup, EggFried, Ham, Drumstick, Fish, Shrimp, Popcorn, CookingPot,
  Cake, Cookie, Candy, Lollipop, Donut, Croissant, Dessert,
  CupSoda, GlassWater, Martini, Milk, Citrus, Grape, WineOff,
  Apple, Banana, Cherry, Carrot, Leaf, Wheat, Nut, Vegan,
  ChefHat, Flame, Microwave, Refrigerator, Store, ShoppingBag, Truck, Clock,
  Star, Heart, ThumbsUp, Award, FlameKindling, BadgeCheck, Sparkles, Zap, Tag,
  Percent, Crown,
} from 'lucide-react'

const LUCIDE_PREFIX = 'lucide:'

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

/** Static map of curated icon name → React component (no dynamic imports needed) */
export const ICON_COMPONENT_MAP: Record<string, LucideIcon> = {
  'utensils': Utensils,
  'pizza': Pizza,
  'coffee': Coffee,
  'beef': Beef,
  'sandwich': Sandwich,
  'salad': Salad,
  'ice-cream-cone': IceCreamCone,
  'cake-slice': CakeSlice,
  'wine': Wine,
  'beer': Beer,
  'soup': Soup,
  'egg-fried': EggFried,
  'ham': Ham,
  'drumstick': Drumstick,
  'fish': Fish,
  'shrimp': Shrimp,
  'popcorn': Popcorn,
  'cooking-pot': CookingPot,
  'cake': Cake,
  'cookie': Cookie,
  'candy': Candy,
  'lollipop': Lollipop,
  'donut': Donut,
  'croissant': Croissant,
  'dessert': Dessert,
  'cup-soda': CupSoda,
  'glass-water': GlassWater,
  'martini': Martini,
  'milk': Milk,
  'citrus': Citrus,
  'grape': Grape,
  'wine-off': WineOff,
  'apple': Apple,
  'banana': Banana,
  'cherry': Cherry,
  'carrot': Carrot,
  'leaf': Leaf,
  'wheat': Wheat,
  'nut': Nut,
  'vegan': Vegan,
  'chef-hat': ChefHat,
  'flame': Flame,
  'microwave': Microwave,
  'refrigerator': Refrigerator,
  'store': Store,
  'shopping-bag': ShoppingBag,
  'truck': Truck,
  'clock': Clock,
  'star': Star,
  'heart': Heart,
  'thumbs-up': ThumbsUp,
  'award': Award,
  'flame-kindling': FlameKindling,
  'badge-check': BadgeCheck,
  'sparkles': Sparkles,
  'zap': Zap,
  'tag': Tag,
  'percent': Percent,
  'crown': Crown,
}

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
