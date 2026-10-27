import { create } from 'zustand'
import { addLine, cartSummary, updateQuantity, type CartLine, type CartSummary } from '@/lib/cart/cart'

export type OrderMode = 'pickup' | 'delivery' | 'dineIn'

interface CartState {
  lines: CartLine[]
  mode: OrderMode
  outletId: string | null
  /** What the last add put in the bag (its own quantity, not the merged line's) — the Added sheet shows it. */
  lastAdded: CartLine | null
  /** A one-off note for the bag (e.g. dishes "Order again" had to leave out); cleared when read away. */
  bagNotice: string | null
  add: (line: CartLine) => void
  setQuantity: (lineId: string, quantity: number) => void
  clear: () => void
  setMode: (mode: OrderMode) => void
  setOutlet: (outletId: string) => void
  setBagNotice: (notice: string | null) => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  mode: 'pickup',
  outletId: null,
  lastAdded: null,
  bagNotice: null,
  add: (line) => set((state) => ({ lines: addLine(state.lines, line), lastAdded: line })),
  setQuantity: (lineId, quantity) => set((state) => ({ lines: updateQuantity(state.lines, lineId, quantity) })),
  clear: () => set({ lines: [], lastAdded: null, bagNotice: null }),
  setMode: (mode) => set({ mode }),
  setOutlet: (outletId) => set({ outletId }),
  setBagNotice: (bagNotice) => set({ bagNotice }),
}))

export const useCartSummary = (): CartSummary => cartSummary(useCart((state) => state.lines))

let lineCounter = 0
export const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter += 1)}`
