/**
 * Wording for the two Messenger texts the WEBSITE sends (not the bot): the
 * cart a customer builds on the storefront (`/api/messenger/send-cart`) and
 * the order summary after a website checkout (`formatOrderMessage`). Both read
 * the store's Messenger Studio messages; blank = the text they always sent.
 * Pure and browser-safe (the Studio preview renders the same functions).
 */

import { formatPrice } from '@/lib/cart-utils'
import { unitCentavos } from './chat-cart'
import { isToggleOn, type MessageSettings, type TextMessageId } from './messages/registry'
import { storeWords } from './messages/say'
import type { ReplyItem } from './store-view'

const wordsFor = (messages: MessageSettings | undefined, id: TextMessageId, values: Record<string, string>): string =>
  storeWords(messages, id, values)

/** One dish of the website cart, as the MENU knows it (never as the browser described it). */
export interface WebCartLine {
  name: string
  qty: number
  /** Menu price of one, in centavos, or null when the line has choices, add-ons or is a combo. */
  unitCentavos: number | null
}

export interface WebCartInput {
  storeName: string
  checkoutUrl: string
  /** Every unit in the cart (the browser's count, bounded by the route). */
  itemCount: number
  /** Dishes the menu could name, in cart order. Lines the menu doesn't know are left out. */
  lines: readonly WebCartLine[]
  /** Every cart line was found on the menu (so a total from menu prices is the whole cart). */
  isComplete: boolean
}

const countText = (count: number) => `${count} item${count !== 1 ? 's' : ''}`

/**
 * The cart text. Default (nothing customised): exactly
 * "🛒 Your cart at {store}: N items.\n\nReady to order?\n{link}".
 */
export function buildWebCartText(input: WebCartInput, messages?: MessageSettings): string {
  const store = input.storeName
  if (input.itemCount <= 0) return wordsFor(messages, 'webcart.empty', { store })

  const parts = [wordsFor(messages, 'webcart.intro', { store, count: countText(input.itemCount) })]

  const body: string[] = []
  if (isToggleOn(messages, 'webcart.list_dishes')) {
    for (const line of input.lines) body.push(`${line.qty}x ${line.name}`)
  }
  const isPriceable = input.isComplete && input.lines.length > 0 && input.lines.every((line) => line.unitCentavos !== null)
  if (isToggleOn(messages, 'webcart.show_total') && isPriceable) {
    const totalCentavos = input.lines.reduce((sum, line) => sum + (line.unitCentavos ?? 0) * line.qty, 0)
    body.push(wordsFor(messages, 'webcart.total', { total: formatPrice(totalCentavos / 100) }))
  }
  if (body.length > 0) parts.push(body.join('\n'))

  let closing = wordsFor(messages, 'webcart.closing', { store, checkout_link: input.checkoutUrl })
  if (!closing.includes(input.checkoutUrl)) closing = `${closing}\n${input.checkoutUrl}`
  parts.push(closing)
  return parts.join('\n\n')
}

/** What the website-checkout order summary says and shows. */
export interface WebOrderWording {
  intro: string
  closing: string
  showsCustomer: boolean
  showsItemPrices: boolean
  showsPayment: boolean
}

export function webOrderWording(storeName: string, messages?: MessageSettings): WebOrderWording {
  return {
    intro: wordsFor(messages, 'weborder.intro', { store: storeName }),
    closing: wordsFor(messages, 'weborder.closing', { store: storeName }),
    showsCustomer: isToggleOn(messages, 'weborder.show_customer'),
    showsItemPrices: isToggleOn(messages, 'weborder.show_item_prices'),
    showsPayment: isToggleOn(messages, 'weborder.show_payment'),
  }
}

/** A website cart line as the browser reports it: only ids and counts are used. */
export interface ReportedCartLine {
  itemId?: string | null
  quantity: number
  /** The customer picked a size, flavour or add-on: the menu price is not this line's price. */
  hasChoices?: boolean
}

/**
 * Name the browser's cart lines from the MENU. A line whose id the menu doesn't
 * know (a combo, a removed dish, an older storefront that sends no ids) is left
 * out and makes the cart incomplete, so no total is printed for it.
 */
export function webCartLines(reported: readonly ReportedCartLine[], menu: readonly ReplyItem[]): { lines: WebCartLine[]; isComplete: boolean } {
  const byId = new Map(menu.map((item) => [item.id, item]))
  const lines: WebCartLine[] = []
  let isComplete = true
  for (const line of reported) {
    const qty = Math.max(0, Math.round(line.quantity))
    if (qty === 0) continue
    const item = line.itemId ? byId.get(line.itemId) : undefined
    if (!item) {
      isComplete = false
      continue
    }
    const isPlain = !line.hasChoices && !item.needsChoices
    lines.push({ name: item.name, qty, unitCentavos: isPlain ? unitCentavos(item) : null })
  }
  return { lines, isComplete }
}
