/**
 * The icons an owner may pick for an order type on the checkout block
 * (`icon_<kind>` knobs, see src/lib/page-designer/order-type-wording.ts).
 * No import from checkout-primitives, so both it and the designs can use it.
 */

import { Armchair, Bike, Car, Coffee, Home, MapPin, ShoppingBag, Store, Utensils, type LucideIcon } from 'lucide-react'

import { wordedIconName, type OrderTypeIconName, type OrderTypeWording } from '@/lib/page-designer/order-type-wording'

export const ICON_BY_NAME: Readonly<Record<OrderTypeIconName, LucideIcon>> = {
  Utensils,
  Coffee,
  Armchair,
  Store,
  ShoppingBag,
  Car,
  Bike,
  MapPin,
  Home,
}

/** The icon the owner picked for this order type, or null = the kind's own icon. */
export function pickedOrderTypeIcon(ot: { type: string }, wording: OrderTypeWording | undefined): LucideIcon | null {
  const name = wordedIconName(ot, wording)
  return name ? ICON_BY_NAME[name] : null
}
