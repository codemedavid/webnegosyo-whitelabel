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

import {
  LUCIDE_PREFIX,
  isLucideIcon,
  getLucideIconName,
  toLucideIconString,
  CURATED_ICON_GROUPS,
  ALL_CURATED_ICONS,
  type IconGroup,
} from '@/lib/category-icon-catalog'

export { LUCIDE_PREFIX, isLucideIcon, getLucideIconName, toLucideIconString, CURATED_ICON_GROUPS, ALL_CURATED_ICONS }
export type { IconGroup }

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

