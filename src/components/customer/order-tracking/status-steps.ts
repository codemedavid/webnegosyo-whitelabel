import { CheckCircle2, ChefHat, Clock, Package, Truck, type LucideIcon } from 'lucide-react'

export interface StatusStep {
  key: string
  label: string
  /** The hero's big line while this is the current step. */
  headline: string
  description: string
  icon: LucideIcon
}

/** The five customer-visible order stages, shared by the hero and the timeline. */
export const STATUS_STEPS: readonly StatusStep[] = [
  { key: 'pending', label: 'Order received', headline: 'We got your order!', description: 'Waiting for the store to confirm.', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', headline: 'Order confirmed', description: 'The store accepted your order.', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', headline: 'Cooking up your order', description: 'Your food is being prepared right now.', icon: ChefHat },
  { key: 'ready', label: 'Ready', headline: 'Your order is ready!', description: 'Ready for pickup or on its way.', icon: Package },
  { key: 'delivered', label: 'Completed', headline: 'Enjoy your meal!', description: 'Order complete. Thanks for ordering!', icon: Truck },
]

export function getStatusIndex(status: string): number {
  return STATUS_STEPS.findIndex((s) => s.key === status)
}
