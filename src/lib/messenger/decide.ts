/**
 * What to answer: an inbound event + the store's rules → a reply decision.
 * Pure and browser-safe (no crypto, no database): the webhook runs it in
 * `handle-event.ts`, and the Studio's chat simulator runs the very same code.
 */

import type { OutgoingMessage } from './graph-message'
import type { InboundEvent } from './events'
import { decodePayload, type MessengerPayload } from './payload'
import {
  buildCart, buildCartChange, buildCategories, buildCategoryItems, buildClearConfirm, buildMenuCard, buildReply,
  type ReplyContext,
} from './replies'
import type { CartOp } from './chat-cart'
import { findEnabledRule, pickRuleForText, type MessengerRule, type RuleAction } from './rules'

/** Staff shortcuts typed in Page Inbox (they never pause the bot). `/menu` etc. kept from the old webhook. */
const STAFF_COMMANDS: Record<string, RuleAction> = {
  menu: { kind: 'menu_card' },
  products: { kind: 'menu_card' },
  product: { kind: 'menu_card' },
  catalog: { kind: 'menu_card' },
  order: { kind: 'menu_card' },
  categories: { kind: 'categories' },
  hours: { kind: 'hours_location' },
}

export function readStaffCommand(text: string): RuleAction | null {
  const match = text.trim().toLowerCase().match(/^[/!]([a-z]+)\b/)
  return match ? STAFF_COMMANDS[match[1]] ?? null : null
}

export interface ReplyNeeds {
  /** Read the chat cart first, applying this op ('read' = no change). */
  cart?: CartOp | 'read'
  /** Read this customer's recent orders first. */
  orders?: boolean
}

export interface ReplyDecision {
  build(ctx: ReplyContext): OutgoingMessage[]
  /** "Talk to staff": the bot steps back for this customer. */
  pausesBot: boolean
  /** A typed message (not a tap on our button): stays unanswered while paused. */
  isTyped: boolean
  needs?: ReplyNeeds
  /** The automation that answered (none for taps on our own buttons). */
  ruleId?: string
}

function needsFor(action: RuleAction): ReplyNeeds | undefined {
  if (action.kind === 'cart') return { cart: 'read' }
  if (action.kind === 'order_status') return { orders: true }
  return undefined
}

function fromAction(action: RuleAction, isTyped: boolean, ruleId?: string): ReplyDecision {
  return {
    build: (ctx) => buildReply(action, ctx), pausesBot: action.kind === 'talk_to_staff', isTyped, needs: needsFor(action),
    ...(ruleId ? { ruleId } : {}),
  }
}

const CART_VERB_OPS = { add: 'add', inc: 'inc', dec: 'dec', rm: 'remove' } as const

function tap(build: ReplyDecision['build'], needs?: ReplyNeeds): ReplyDecision {
  return { build, pausesBot: false, isTyped: false, needs }
}

function getStarted(rules: readonly MessengerRule[]): ReplyDecision {
  const rule = findEnabledRule(rules, (entry) => entry.trigger.kind === 'get_started')
  return fromAction(rule?.action ?? { kind: 'menu_card' }, false, rule?.id)
}

function fromPayload(payload: MessengerPayload, rules: readonly MessengerRule[]): ReplyDecision {
  switch (payload.verb) {
    case 'start':
      return getStarted(rules)
    case 'rule': {
      // A starter question or menu button whose rule was since removed still gets an answer.
      const rule = findEnabledRule(rules, (entry) => entry.id === payload.ruleId)
      return fromAction(rule?.action ?? { kind: 'menu_card' }, false, rule?.id)
    }
    case 'menu':
      return tap((ctx) => buildMenuCard(ctx))
    case 'categories':
      return tap((ctx) => buildCategories(ctx))
    case 'category':
      return tap((ctx) => buildCategoryItems(ctx, payload.categoryId, payload.page))
    case 'staff':
      return fromAction({ kind: 'talk_to_staff' }, false)
    case 'add':
    case 'inc':
    case 'dec':
    case 'rm':
      return tap(buildCartChange, { cart: { kind: CART_VERB_OPS[payload.verb], itemId: payload.itemId } })
    case 'cart':
      return tap((ctx) => buildCart(ctx), { cart: 'read' })
    case 'clear':
      return tap((ctx) => buildClearConfirm(ctx))
    case 'clear_yes':
      return tap(buildCartChange, { cart: { kind: 'clear' } })
    case 'orders':
      return fromAction({ kind: 'order_status' }, false)
  }
}

/** What to answer, or null for nothing. Pure. */
export function decideReply(event: InboundEvent, rules: readonly MessengerRule[]): ReplyDecision | null {
  switch (event.kind) {
    case 'text': {
      const rule = pickRuleForText(rules, event.text)
      return rule ? fromAction(rule.action, true, rule.id) : null
    }
    case 'quick_reply': {
      const payload = decodePayload(event.payload)
      if (payload) return fromPayload(payload, rules)
      const rule = pickRuleForText(rules, event.text)
      return rule ? fromAction(rule.action, true, rule.id) : null
    }
    case 'postback': {
      const payload = decodePayload(event.payload)
      return payload ? fromPayload(payload, rules) : null
    }
    case 'referral':
      // A link into the chat that is not an order: greet like Get Started.
      return getStarted(rules)
    default:
      return null
  }
}
