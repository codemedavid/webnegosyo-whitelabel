import { create } from 'zustand'
import { addLine, cartSummary, updateQuantity, type CartLine, type CartSummary } from '@/lib/cart/cart'

export type OrderMode = 'pickup' | 'delivery' | 'dineIn'

interface CartState {
  lines: CartLine[]
  mode: OrderMode
  outletId: string | null
  add: (line: CartLine) => void
  setQuantity: (lineId: string, quantity: number) => void
  clear: () => void
  setMode: (mode: OrderMode) => void
  setOutlet: (outletId: string) => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  mode: 'pickup',
  outletId: null,
  add: (line) => set((state) => ({ lines: addLine(state.lines, line) })),
  setQuantity: (lineId, quantity) => set((state) => ({ lines: updateQuantity(state.lines, lineId, quantity) })),
  clear: () => set({ lines: [] }),
  setMode: (mode) => set({ mode }),
  setOutlet: (outletId) => set({ outletId }),
}))

export const useCartSummary = (): CartSummary => cartSummary(useCart((state) => state.lines))

let lineCounter = 0
export const nextLineId = () => `line-${Date.now().toString(36)}-${(lineCounter += 1)}`
