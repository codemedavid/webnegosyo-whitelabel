import { CheckCircle2, ChefHat, Clock, Package, Truck, type LucideIcon } from 'lucide-react'
import type { StorefrontLabelKey } from '@/lib/storefront-labels'

export interface StatusStep {
  key: string
  label: string
  /** The hero's big line while this is the current step. */
  headline: string
  description: string
  icon: LucideIcon
  /** The store's own wording for each line (Branding Studio → Order status → Labels). */
  titleLabel: StorefrontLabelKey
  headlineLabel: StorefrontLabelKey
  descriptionLabel: StorefrontLabelKey
}

/** The five customer-visible order stages, shared by the hero and the timeline. */
export const STATUS_STEPS: readonly StatusStep[] = [
  {
    key: 'pending', label: 'Order received', headline: 'We got your order!', description: 'Waiting for the store to confirm.', icon: Clock,
    titleLabel: 'tracking.received', headlineLabel: 'tracking.received_headline', descriptionLabel: 'tracking.received_detail',
  },
  {
    key: 'confirmed', label: 'Confirmed', headline: 'Order confirmed', description: 'The store accepted your order.', icon: CheckCircle2,
    titleLabel: 'tracking.confirmed', headlineLabel: 'tracking.confirmed_headline', descriptionLabel: 'tracking.confirmed_detail',
  },
  {
    key: 'preparing', label: 'Preparing', headline: 'Cooking up your order', description: 'Your food is being prepared right now.', icon: ChefHat,
    titleLabel: 'tracking.preparing', headlineLabel: 'tracking.preparing_headline', descriptionLabel: 'tracking.preparing_detail',
  },
  {
    key: 'ready', label: 'Ready', headline: 'Your order is ready!', description: 'Ready for pickup or on its way.', icon: Package,
    titleLabel: 'tracking.ready', headlineLabel: 'tracking.ready_headline', descriptionLabel: 'tracking.ready_detail',
  },
  {
    key: 'delivered', label: 'Completed', headline: 'Enjoy your meal!', description: 'Order complete. Thanks for ordering!', icon: Truck,
    titleLabel: 'tracking.completed', headlineLabel: 'tracking.completed_headline', descriptionLabel: 'tracking.completed_detail',
  },
]

export function getStatusIndex(status: string): number {
  return STATUS_STEPS.findIndex((s) => s.key === status)
}
