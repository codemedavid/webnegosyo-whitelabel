import type { Selections } from './pricing'

export const MAX_LINE_QUANTITY = 99

export interface CartLine {
  lineId: string
  itemId: string
  name: string
  imageUrl: string | null
  selections: Selections
  /** Labels frozen at add time, for the cart row. */
  optionLabels: string[]
  quantity: number
  /** Unit price at add time; the server reprices at checkout regardless. */
  unitCentavos: number
}

export interface CartSummary {
  itemCount: number
  subtotalCentavos: number
}

const clampQuantity = (quantity: number) => Math.max(0, Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)))

/** Same item with the same picks (order-insensitive, empty groups ignored) → same key. */
export function lineKey(itemId: string, selections: Selections): string {
  const groups = Object.keys(selections)
    .sort()
    .map((groupId) => {
      const picks = Object.entries(selections[groupId])
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([optionId, count]) => `${optionId}*${count}`)
      return picks.length > 0 ? `${groupId}:${picks.join(',')}` : ''
    })
    .filter(Boolean)
  return `${itemId}|${groups.join(';')}`
}

export function addLine(lines: readonly CartLine[], incoming: CartLine): CartLine[] {
  const key = lineKey(incoming.itemId, incoming.selections)
  const match = lines.find((line) => lineKey(line.itemId, line.selections) === key)
  if (!match) return [...lines, { ...incoming, quantity: clampQuantity(incoming.quantity) }]
  return lines.map((line) =>
    line === match ? { ...line, quantity: clampQuantity(line.quantity + incoming.quantity) } : line,
  )
}

export function updateQuantity(lines: readonly CartLine[], lineId: string, quantity: number): CartLine[] {
  const next = clampQuantity(quantity)
  if (next === 0) return lines.filter((line) => line.lineId !== lineId)
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity: next } : line))
}

export function cartSummary(lines: readonly CartLine[]): CartSummary {
  return lines.reduce(
    (summary, line) => ({
      itemCount: summary.itemCount + line.quantity,
      subtotalCentavos: summary.subtotalCentavos + line.unitCentavos * line.quantity,
    }),
    { itemCount: 0, subtotalCentavos: 0 },
  )
}
