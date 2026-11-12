/**
 * The Studio's test chat (plan 2026-11-11, A4): what the webhook would answer,
 * worked out in the browser. Runs the real `decideReply` and reply builders
 * over the store's menu with a local sample cart. Nothing is sent to Meta and
 * nothing is stored. Pure.
 */

import { applyCartOp, priceChatCart, type ChatCartLine } from './chat-cart'
import { decideReply } from './decide'
import type { InboundEvent } from './events'
import type { OutgoingMessage } from './graph-message'
import type { MessageSettings } from './messages/registry'
import { withPreviewData, type ReplyContext } from './replies'
import type { MessengerRule } from './rules'
import type { ReplyStore } from './store-view'

export type SimInput =
  | { kind: 'text'; text: string }
  /** A tap on one of our buttons: quick replies carry the title as text, postbacks don't. */
  | { kind: 'tap'; title: string; payload: string; isQuickReply: boolean }

export interface SimEnv {
  store: ReplyStore
  rules: readonly MessengerRule[]
  messages: MessageSettings
  botEnabled: boolean
  customerName?: string
  /** Pretend the store is open / closed (the "Only when" automations). Absent = the store's hours now. */
  isOpen?: boolean
}

export interface SimResult {
  reply: OutgoingMessage[]
  /** The automation that answered (null for taps on the bot's own buttons). */
  ruleId: string | null
  cart: ChatCartLine[]
  /** Why nothing was answered. */
  silence?: 'bot_off' | 'no_match'
}

function toEvent(input: SimInput): InboundEvent {
  const base = { pageId: 'studio', psid: 'studio', timestamp: 0, dedupeKey: 'studio' }
  if (input.kind === 'text') return { ...base, kind: 'text', text: input.text }
  return input.isQuickReply
    ? { ...base, kind: 'quick_reply', text: input.title, payload: input.payload }
    : { ...base, kind: 'postback', payload: input.payload, title: input.title }
}

export function simulate(input: SimInput, cart: readonly ChatCartLine[], env: SimEnv): SimResult {
  if (!env.botEnabled) return { reply: [], ruleId: null, cart: [...cart], silence: 'bot_off' }
  const decision = decideReply(toEvent(input), env.rules, env.isOpen ?? env.store.isOpenNow ?? true)
  if (!decision) return { reply: [], ruleId: null, cart: [...cart], silence: 'no_match' }

  let ctx: ReplyContext = { store: env.store, linkToken: null, messages: env.messages, customerName: env.customerName ?? '' }
  let nextCart: ChatCartLine[] = [...cart]
  const needs = decision.needs
  if (needs?.cart) {
    const applied = needs.cart === 'read' ? null : applyCartOp(cart, needs.cart, env.store)
    if (applied) nextCart = applied.cart
    const priced = priceChatCart(nextCart, env.store)
    nextCart = priced.kept
    ctx = {
      ...ctx,
      cart: {
        priced,
        ...(applied ? { outcome: applied.outcome } : {}),
        ...(needs.cart !== 'read' && 'itemId' in needs.cart ? { itemId: needs.cart.itemId } : {}),
      },
    }
  }
  // Recent orders: a sample order, as in the editor preview.
  if (needs?.orders) ctx = { ...ctx, orders: withPreviewData({ ...ctx, cart: ctx.cart }).orders }

  return { reply: decision.build(ctx), ruleId: decision.ruleId ?? null, cart: nextCart }
}
