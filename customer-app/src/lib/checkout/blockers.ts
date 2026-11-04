import type { AppOrderKind, AppOrderType, AppOutlet } from '@/lib/contract'
import { formatPeso } from '@/lib/money'
import type { OrderMode } from '@/lib/stores/cart'

const KIND_FOR_MODE: Record<OrderMode, AppOrderKind> = { pickup: 'pickup', delivery: 'delivery', dineIn: 'dine_in' }
const MODE_WORDS: Record<OrderMode, string> = { pickup: 'pick up', delivery: 'delivery', dineIn: 'dine in' }

export function orderTypeForMode(mode: OrderMode, orderTypes: readonly AppOrderType[]): AppOrderType | undefined {
  return orderTypes.find((orderType) => orderType.kind === KIND_FOR_MODE[mode])
}

export function outletSupportsMode(outlet: AppOutlet, mode: OrderMode): boolean {
  if (mode === 'delivery') return outlet.supportsDelivery
  if (mode === 'dineIn') return outlet.supportsDineIn
  return outlet.supportsPickup
}

/** Where the delivery fee for the typed address stands; only delivery orders read it. */
export type DeliveryFeeStatus = 'ready' | 'unconfirmed' | 'quoting' | 'failed'

const FEE_BLOCKERS: Record<Exclude<DeliveryFeeStatus, 'ready'>, string> = {
  unconfirmed: 'Confirm your address to see the delivery fee',
  quoting: 'Getting the delivery fee…',
  failed: 'We couldn’t price delivery to this address',
}

export interface CheckoutState {
  itemCount: number
  isMember: boolean
  mode: OrderMode
  orderType: AppOrderType | undefined
  outlet: AppOutlet | undefined
  /** Multi-branch stores must know which branch makes the order. */
  needsOutlet: boolean
  paymentMethodId: string | null
  deliveryAddress: string
  /** The address was picked from the search (it has a pin); typed text alone cannot be delivered to. */
  hasDeliveryPlace: boolean
  deliveryFee: DeliveryFeeStatus
  shortfallCentavos: number
}

/**
 * Why "Place order" is not ready yet, most basic first. Empty = ready. The
 * first entry is what the button explains; a guest only ever hears "sign in".
 */
export function checkoutBlockers(state: CheckoutState): string[] {
  if (!state.isMember) return ['Sign in to place your order']
  const isDelivery = state.mode === 'delivery'
  const checks: [boolean, string][] = [
    [state.itemCount === 0, 'Your bag is empty'],
    [state.orderType === undefined, `This store is not taking ${MODE_WORDS[state.mode]} orders`],
    [state.needsOutlet && state.outlet === undefined, 'Choose a branch'],
    [
      state.outlet !== undefined && !outletSupportsMode(state.outlet, state.mode),
      `${state.outlet?.name ?? 'This branch'} does not ${isDelivery ? 'deliver' : `offer ${MODE_WORDS[state.mode]}`}`,
    ],
    [isDelivery && state.deliveryAddress.trim() === '', 'Add a delivery address'],
    [isDelivery && state.deliveryAddress.trim() !== '' && !state.hasDeliveryPlace, 'Pick your address from the search results'],
    // A fee that is still loading or failed must never be charged as ₱0.
    ...(isDelivery && state.hasDeliveryPlace && state.deliveryFee !== 'ready'
      ? [[true, FEE_BLOCKERS[state.deliveryFee]] as [boolean, string]]
      : []),
    [state.shortfallCentavos > 0, `Add ${formatPeso(state.shortfallCentavos)} more for ${MODE_WORDS[state.mode]}`],
    [state.paymentMethodId === null, 'Choose how to pay'],
  ]
  return checks.filter(([isBlocked]) => isBlocked).map(([, message]) => message)
}
