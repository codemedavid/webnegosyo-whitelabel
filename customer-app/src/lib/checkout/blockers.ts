import type { AppOrderKind, AppOrderType, AppOutlet } from '@/lib/contract'
import { formatPeso } from '@/lib/money'
import type { OrderMode } from '@/lib/stores/cart'
import type { VoucherStatus } from './voucher'

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

/** Where the delivery fee for the picked place stands; only delivery orders read it. */
export type DeliveryFeeStatus = 'ready' | 'quoting' | 'failed' | 'refused'

const FEE_BLOCKERS: Record<Exclude<DeliveryFeeStatus, 'ready'>, string> = {
  quoting: 'Getting the delivery fee…',
  failed: 'We couldn’t price delivery to this address',
  refused: 'This branch doesn’t deliver to that address',
}

const VOUCHER_BLOCKERS: Partial<Record<VoucherStatus, string>> = {
  checking: 'Checking your voucher…',
  failed: 'We couldn’t check your voucher. Try again or remove it',
}

export interface CheckoutState {
  itemCount: number
  isMember: boolean
  /** The member gave a name (stores call orders out by it); absent = yes. */
  hasName?: boolean
  mode: OrderMode
  orderType: AppOrderType | undefined
  outlet: AppOutlet | undefined
  /** Multi-branch stores must know which branch makes the order. */
  needsOutlet: boolean
  paymentMethodId: string | null
  /** The order type offers at least one method; with none the order goes without one, as on the web. */
  hasPaymentMethods: boolean
  /** The chosen method needs proof: a typed reference number until screenshots arrive. */
  needsPaymentReference: boolean
  paymentReference: string
  /** A place was picked from the search (it has a pin); typed text alone cannot be delivered to. */
  hasDeliveryPlace: boolean
  deliveryFee: DeliveryFeeStatus
  /** The store's own words when it won't deliver there (out of area); null otherwise. */
  deliveryRefusal: string | null
  voucher: VoucherStatus
  shortfallCentavos: number
  /** The store's required questions still blank, already worded ("Answer “Pickup date”"); absent = none. */
  unansweredQuestions?: readonly string[]
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
    [state.hasName === false, 'Add your name'],
    [state.orderType === undefined, `This store is not taking ${MODE_WORDS[state.mode]} orders`],
    [state.needsOutlet && state.outlet === undefined, 'Choose a branch'],
    [
      state.outlet !== undefined && !outletSupportsMode(state.outlet, state.mode),
      `${state.outlet?.name ?? 'This branch'} does not ${isDelivery ? 'deliver' : `offer ${MODE_WORDS[state.mode]}`}`,
    ],
    [isDelivery && !state.hasDeliveryPlace, 'Add a delivery address'],
    // A fee that is still loading or failed must never be charged as ₱0.
    ...(isDelivery && state.hasDeliveryPlace && state.deliveryFee !== 'ready'
      ? [[true, (state.deliveryFee === 'refused' ? state.deliveryRefusal : null) ?? FEE_BLOCKERS[state.deliveryFee]] as [boolean, string]]
      : []),
    [state.shortfallCentavos > 0, `Add ${formatPeso(state.shortfallCentavos)} more for ${MODE_WORDS[state.mode]}`],
    [state.paymentMethodId === null && state.hasPaymentMethods, 'Choose how to pay'],
    ...(state.unansweredQuestions ?? []).map((message): [boolean, string] => [true, message]),
    [state.paymentMethodId !== null && state.needsPaymentReference && state.paymentReference.trim() === '', 'Add your payment reference number'],
    ...(VOUCHER_BLOCKERS[state.voucher] ? [[true, VOUCHER_BLOCKERS[state.voucher]] as [boolean, string]] : []),
  ]
  return checks.filter(([isBlocked]) => isBlocked).map(([, message]) => message)
}
