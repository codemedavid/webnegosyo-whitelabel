import type { AppOutlet } from '@/lib/contract'
import type { OrderMode } from '@/lib/stores/cart'

export interface OutletAvailability {
  isAvailable: boolean
  reason: string | null
}

export interface BranchOption extends OutletAvailability {
  outlet: AppOutlet
  isSelected: boolean
}

const SUPPORTS: Record<OrderMode, keyof Pick<AppOutlet, 'supportsPickup' | 'supportsDelivery' | 'supportsDineIn'>> = {
  pickup: 'supportsPickup',
  delivery: 'supportsDelivery',
  dineIn: 'supportsDineIn',
}

const UNAVAILABLE_REASON: Record<OrderMode, string> = {
  pickup: 'No pick up at this branch',
  delivery: 'Doesn’t deliver',
  dineIn: 'No dine in at this branch',
}

export function outletAvailability(outlet: AppOutlet, mode: OrderMode): OutletAvailability {
  return outlet[SUPPORTS[mode]]
    ? { isAvailable: true, reason: null }
    : { isAvailable: false, reason: UNAVAILABLE_REASON[mode] }
}

/** Branches the customer can use right now come first; menu order is kept within each group. */
export function branchOptions(outlets: readonly AppOutlet[], mode: OrderMode, selectedId: string | null): BranchOption[] {
  const options = outlets.map((outlet) => ({
    outlet,
    isSelected: outlet.id === selectedId,
    ...outletAvailability(outlet, mode),
  }))
  return [...options.filter((option) => option.isAvailable), ...options.filter((option) => !option.isAvailable)]
}

/** The branch to start with: the first that serves this mode, else the first at all (its picker row says why not). */
export function defaultOutlet(outlets: readonly AppOutlet[], mode: OrderMode): AppOutlet | undefined {
  return outlets.find((outlet) => outletAvailability(outlet, mode).isAvailable) ?? outlets[0]
}
