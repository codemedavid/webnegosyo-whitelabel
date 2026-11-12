/**
 * The chat cart on `messenger_sessions.cart_data` (service role only).
 *
 * Two quick taps arrive as two webhook events processed side by side, so a
 * write only lands when `cart_version` is still the one that was read; on a
 * race the op is re-applied to the fresh cart (at most 3 tries).
 */

import 'server-only'
import { messengerDb } from './service-db'
import { applyCartOp, parseChatCart, priceChatCart, sameCart, type CartOp, type ChatCartLine, type CartOpOutcome } from './chat-cart'
import type { ChatCartView } from './replies'
import type { ReplyStore } from './store-view'

const MAX_ATTEMPTS = 3

interface CartRow {
  cart_data: unknown
  cart_version: number
}

async function readCartRow(sessionId: string): Promise<CartRow | null> {
  const { data, error } = await messengerDb()
    .from('messenger_sessions')
    .select('cart_data, cart_version')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[Messenger] chat cart not readable', { code: error.code, message: error.message })
    return null
  }
  return data as unknown as CartRow
}

/** Write `next` if nobody changed the cart since `version`. True = written; false = raced; null = error. */
async function writeCart(sessionId: string, version: number, next: readonly ChatCartLine[]): Promise<boolean | null> {
  const { data, error } = await messengerDb()
    .from('messenger_sessions')
    .update({ cart_data: next, cart_version: version + 1 } as never)
    .eq('id', sessionId)
    .eq('cart_version', version)
    .select('id')
  if (error) {
    console.error('[Messenger] chat cart not written', { code: error.code, message: error.message })
    return null
  }
  return (data ?? []).length === 1
}

export async function changeChatCart(input: { sessionId: string; op: CartOp | null; store: ReplyStore }): Promise<ChatCartView | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readCartRow(input.sessionId)
    if (!row) return null
    const current = parseChatCart(row.cart_data)
    let outcome: CartOpOutcome | undefined
    let next = current
    if (input.op) {
      const applied = applyCartOp(current, input.op, input.store)
      outcome = applied.outcome
      next = applied.cart
    }
    const priced = priceChatCart(next, input.store)
    if (!sameCart(priced.kept, current) || !Array.isArray(row.cart_data)) {
      const written = await writeCart(input.sessionId, row.cart_version, priced.kept)
      if (written === null) return null
      if (!written) continue
    }
    return { priced, outcome }
  }
  console.error('[Messenger] chat cart write kept racing')
  return null
}

/** The cart a signed link's session holds, for the web cart to load. */
export async function readChatCart(sessionId: string): Promise<ChatCartLine[] | null> {
  const row = await readCartRow(sessionId)
  return row ? parseChatCart(row.cart_data) : null
}

/**
 * Empty the chat cart once an order was placed with this session's link.
 * Best effort: a failure leaves the dishes in the chat cart, nothing worse.
 */
export async function emptyChatCart(sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const row = await readCartRow(sessionId)
    if (!row || parseChatCart(row.cart_data).length === 0) return
    // Through the version too, so a tap racing the order can't put the dishes back.
    const written = await writeCart(sessionId, row.cart_version, [])
    if (written !== false) return
  }
  console.error('[Messenger] chat cart not emptied after order (kept racing)')
}
