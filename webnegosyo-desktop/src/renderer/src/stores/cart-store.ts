import { create } from 'zustand'
import type { Addon, MenuItem, Variation, VariationOption } from '../lib/menu-types'

// A single cart line. The same menu item with different variations/addons is a
// separate line, so each carries its own generated `lineId`.
export interface CartLine {
  lineId: string
  item: MenuItem
  // New grouped-variation format: variationTypeId -> chosen option
  selectedVariations: Record<string, VariationOption>
  // Legacy flat-variation format
  selectedVariation?: Variation
  selectedAddons: Addon[]
  quantity: number
  specialInstructions?: string
  unitPrice: number
  subtotal: number
}

interface CartState {
  lines: CartLine[]
  addLine: (line: Omit<CartLine, 'lineId' | 'unitPrice' | 'subtotal'>) => void
  setQuantity: (lineId: string, quantity: number) => void
  removeLine: (lineId: string) => void
  clear: () => void
  total: () => number
  itemCount: () => number
}

/**
 * Per-unit price = base (discounted if present) + selected variation modifiers
 * + addon prices. Mirrors the mobile cart math so receipts/totals match online
 * orders.
 */
export function computeUnitPrice(
  item: MenuItem,
  selectedVariations: Record<string, VariationOption>,
  selectedVariation: Variation | undefined,
  selectedAddons: Addon[]
): number {
  const base = item.discounted_price ?? item.price
  const variationDelta = Object.values(selectedVariations).reduce(
    (sum, opt) => sum + (opt.price_modifier ?? 0),
    0
  )
  const legacyDelta = selectedVariation?.price_modifier ?? 0
  const addonDelta = selectedAddons.reduce((sum, a) => sum + (a.price ?? 0), 0)
  return base + variationDelta + legacyDelta + addonDelta
}

let lineCounter = 0
function nextLineId(): string {
  lineCounter += 1
  return `line_${Date.now()}_${lineCounter}`
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],

  addLine: (line) => {
    const unitPrice = computeUnitPrice(
      line.item,
      line.selectedVariations,
      line.selectedVariation,
      line.selectedAddons
    )
    const newLine: CartLine = {
      ...line,
      lineId: nextLineId(),
      unitPrice,
      subtotal: unitPrice * line.quantity,
    }
    set((state) => ({ lines: [...state.lines, newLine] }))
  },

  setQuantity: (lineId, quantity) => {
    if (quantity < 1) {
      get().removeLine(lineId)
      return
    }
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, quantity, subtotal: l.unitPrice * quantity } : l
      ),
    }))
  },

  removeLine: (lineId) => set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) })),

  clear: () => set({ lines: [] }),

  total: () => get().lines.reduce((sum, l) => sum + l.subtotal, 0),

  itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
}))
