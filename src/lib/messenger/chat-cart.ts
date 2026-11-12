/**
 * The chat cart: what a customer added from Messenger, before checkout. Pure.
 *
 * Stored on `messenger_sessions.cart_data` as `[{ itemId, qty, name }]` (the
 * name only to say WHICH dish was taken out once it left the menu): prices are never stored, every cart reply re-prices from the live
 * menu (`priceChatCart`), and the web checkout re-prices again. Only simple
 * dishes (no required choice) can be added from the chat; a dish that went
 * sold out, was hidden, or gained a required choice since is dropped from the
 * cart the next time it is shown, and the customer is told.
 */

import type { ReplyItem, ReplyStore } from './store-view'

export const MAX_CART_LINES = 20
export const MAX_LINE_QTY = 50

export interface ChatCartLine {
  itemId: string
  qty: number
  /** The dish's name when it was added. */
  name?: string
}

const MAX_NAME = 80

export type CartOp =
  | { kind: 'add'; itemId: string }
  | { kind: 'inc'; itemId: string }
  | { kind: 'dec'; itemId: string }
  | { kind: 'remove'; itemId: string }
  | { kind: 'clear' }

/** What a cart op did, for the reply. */
export type CartOpOutcome =
  | 'added' | 'increased' | 'decreased' | 'removed' | 'cleared'
  /** The dish isn't orderable from the chat (sold out, gone, needs choices). */
  | 'unavailable'
  /** 20 different dishes already. */
  | 'cart_full'
  /** 50 of this dish already. */
  | 'max_qty'
  /** −, + or Remove on a dish no longer in the cart (an old message). */
  | 'not_in_cart'

const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Stored cart → clean lines: bad entries dropped, duplicates merged, caps applied. Never throws. */
export function parseChatCart(raw: unknown): ChatCartLine[] {
  if (!Array.isArray(raw)) return []
  const lines: ChatCartLine[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { itemId, qty, name } = entry as { itemId?: unknown; qty?: unknown; name?: unknown }
    if (typeof itemId !== 'string' || !ITEM_ID.test(itemId)) continue
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) continue
    const existing = lines.find((line) => line.itemId === itemId)
    if (existing) existing.qty = Math.min(MAX_LINE_QTY, existing.qty + qty)
    else if (lines.length < MAX_CART_LINES) {
      const cleanName = typeof name === 'string' && name.trim() ? Array.from(name.trim()).slice(0, MAX_NAME).join('') : undefined
      lines.push({ itemId, qty: Math.min(MAX_LINE_QTY, qty), ...(cleanName ? { name: cleanName } : {}) })
    }
  }
  return lines
}

/** A dish that can be added from the chat. */
export function chatOrderableItem(store: ReplyStore, itemId: string): ReplyItem | null {
  const item = store.items.find((entry) => entry.id === itemId)
  return item && !item.needsChoices ? item : null
}

/** Apply one op. Returns the new cart (a new array; the input is untouched) and what happened. */
export function applyCartOp(
  cart: readonly ChatCartLine[],
  op: CartOp,
  store: ReplyStore,
): { cart: ChatCartLine[]; outcome: CartOpOutcome } {
  const lines = cart.map((line) => ({ ...line }))
  if (op.kind === 'clear') return { cart: [], outcome: 'cleared' }

  const index = lines.findIndex((line) => line.itemId === op.itemId)
  switch (op.kind) {
    case 'add':
    case 'inc': {
      const item = chatOrderableItem(store, op.itemId)
      if (!item) {
        // Take a dish that can't be ordered any more out, so the cart stays honest.
        return { cart: lines.filter((line) => line.itemId !== op.itemId), outcome: 'unavailable' }
      }
      if (index === -1) {
        if (op.kind === 'inc') return { cart: lines, outcome: 'not_in_cart' }
        if (lines.length >= MAX_CART_LINES) return { cart: lines, outcome: 'cart_full' }
        return { cart: [...lines, { itemId: op.itemId, qty: 1, name: Array.from(item.name).slice(0, MAX_NAME).join('') }], outcome: 'added' }
      }
      if (lines[index].qty >= MAX_LINE_QTY) return { cart: lines, outcome: 'max_qty' }
      lines[index].qty += 1
      return { cart: lines, outcome: op.kind === 'add' ? 'added' : 'increased' }
    }
    case 'dec': {
      if (index === -1) return { cart: lines, outcome: 'not_in_cart' }
      if (lines[index].qty <= 1) return { cart: lines.filter((_, position) => position !== index), outcome: 'removed' }
      lines[index].qty -= 1
      return { cart: lines, outcome: 'decreased' }
    }
    case 'remove':
      if (index === -1) return { cart: lines, outcome: 'not_in_cart' }
      return { cart: lines.filter((_, position) => position !== index), outcome: 'removed' }
  }
}

export interface PricedCartLine {
  item: ReplyItem
  qty: number
  unitCentavos: number
  lineCentavos: number
}

export interface PricedChatCart {
  lines: PricedCartLine[]
  /** Dishes taken out because they can't be ordered from the chat any more ("A dish" when it left the menu). */
  droppedNames: string[]
  /** The cart with those dishes taken out (write it back when it differs). */
  kept: ChatCartLine[]
  totalCentavos: number
  itemCount: number
}

export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100)
}

/** The menu price a customer sees today (the sale price when there is one). */
export function unitCentavos(item: ReplyItem): number {
  return toCentavos(item.discountedPrice ?? item.price)
}

export function priceChatCart(cart: readonly ChatCartLine[], store: ReplyStore): PricedChatCart {
  const lines: PricedCartLine[] = []
  const kept: ChatCartLine[] = []
  const droppedNames: string[] = []
  for (const line of cart) {
    const item = chatOrderableItem(store, line.itemId)
    if (!item) {
      droppedNames.push(line.name ?? store.items.find((entry) => entry.id === line.itemId)?.name ?? 'A dish')
      continue
    }
    const unit = unitCentavos(item)
    lines.push({ item, qty: line.qty, unitCentavos: unit, lineCentavos: unit * line.qty })
    kept.push({ itemId: line.itemId, qty: line.qty, name: Array.from(item.name).slice(0, MAX_NAME).join('') })
  }
  return {
    lines,
    droppedNames,
    kept,
    totalCentavos: lines.reduce((sum, line) => sum + line.lineCentavos, 0),
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
  }
}

export function sameCart(a: readonly ChatCartLine[], b: readonly ChatCartLine[]): boolean {
  return a.length === b.length && a.every((line, index) => line.itemId === b[index].itemId && line.qty === b[index].qty && line.name === b[index].name)
}
