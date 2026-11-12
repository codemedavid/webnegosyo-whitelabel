import { create } from 'zustand'
import { addLine, cartSummary, updateQuantity, type CartLine, type CartSummary } from '@/lib/cart/cart'
import type { PickedPlace } from '@/lib/checkout/delivery-quote'
import type { CheckoutAttempt } from '@/lib/checkout/idempotency'

export type OrderMode = 'pickup' | 'delivery' | 'dineIn'

interface CartState {
  lines: CartLine[]
  mode: OrderMode
  outletId: string | null
  /** What the last add put in the bag (its own quantity, not the merged line's) — the Added sheet shows it. */
  lastAdded: CartLine | null
  /** A one-off note for the bag (e.g. dishes "Order again" had to leave out); cleared when read away. */
  bagNotice: string | null
  /** Where a delivery goes: a place picked from the address search (never typed text). */
  deliveryPlace: PickedPlace | null
  /** The Idempotency-Key of the current checkout attempt; kept across retries of the same bag. */
  checkoutAttempt: CheckoutAttempt | null
  /** Answers to the store's own checkout questions, by question id (kept when the order type changes and back). */
  answers: Record<string, string>
  add: (line: CartLine) => void
  setQuantity: (lineId: string, quantity: number) => void
  clear: () => void
  setMode: (mode: OrderMode) => void
  setOutlet: (outletId: string) => void
  setBagNotice: (notice: string | null) => void
  setDeliveryPlace: (place: PickedPlace | null) => void
  setCheckoutAttempt: (attempt: CheckoutAttempt | null) => void
  setAnswer: (questionId: string, value: string) => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  mode: 'pickup',
  outletId: null,
  lastAdded: null,
  bagNotice: null,
  deliveryPlace: null,
  checkoutAttempt: null,
  answers: {},
  add: (line) => set((state) => ({ lines: addLine(state.lines, line), lastAdded: line })),
  setQuantity: (lineId, quantity) => set((state) => ({ lines: updateQuantity(state.lines, lineId, quantity) })),
  // After an order (or a change of person): the next order is a new attempt to a place picked again.
  clear: () => set({ lines: [], lastAdded: null, bagNotice: null, deliveryPlace: null, checkoutAttempt: null, answers: {} }),
  setMode: (mode) => set({ mode }),
  setOutlet: (outletId) => set({ outletId }),
  setBagNotice: (bagNotice) => set({ bagNotice }),
  setDeliveryPlace: (deliveryPlace) => set({ deliveryPlace }),
  setCheckoutAttempt: (checkoutAttempt) => set({ checkoutAttempt }),
  setAnswer: (questionId, value) => set((state) => ({ answers: { ...state.answers, [questionId]: value } })),
}))

export const useCartSummary = (): CartSummary => cartSummary(useCart((state) => state.lines))

let lineCounter = 0
export const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter += 1)}`
