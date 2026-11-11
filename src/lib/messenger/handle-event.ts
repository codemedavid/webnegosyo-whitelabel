/**
 * One webhook event → at most one reply. The webhook's whole decision, with
 * every side effect injected so the rules are testable without Meta or a DB.
 *
 * Order of checks:
 *   1. seen before (Meta retry) → drop
 *   2. Page not connected to a store → drop
 *   3. `ORDER_<id>` referral → the order summary (unchanged behaviour)
 *   4. echo → ours: ignore · staff slash command: send that card · anything
 *      else staff typed: pause the bot for this customer
 *   5. "TEST 123456" from the owner → link their Messenger for test sends
 *   6. bot off → stay quiet
 *   7. rule / button → reply. While a staff reply has the bot paused, typed
 *      messages get no bot answer; taps on our own buttons still do.
 *      A reply that shows the cart or orders has them read (and a cart tap
 *      applied) first, so the pure builders only ever format.
 */

import type { OutgoingMessage } from './graph-message'
import type { InboundEvent } from './events'
import type { StoreBundle } from './settings'
import { decodePayload, type MessengerPayload } from './payload'
import {
  buildCart, buildCartChange, buildCategories, buildCategoryItems, buildClearConfirm, buildMenuCard, buildReply,
  type ChatCartView, type ReplyContext,
} from './replies'
import type { CartOp } from './chat-cart'
import type { ReplyOrder } from './order-view'
import type { ReplyStore } from './store-view'
import { findEnabledRule, pickRuleForText, type MessengerRule, type RuleAction } from './rules'
import { orderIdFromRef } from './ref'
import type { MessengerSession } from './session'
import type { SendResult } from './send'
import { isTesterCodeValid, readTesterCode } from './tester'

export interface PageOwner {
  tenantId: string
  token: string
}

export interface WebhookDeps {
  /** FACEBOOK_APP_ID: echoes carrying it are our own sends. */
  ourAppId: string | null
  botMetadata: string
  now(): Date
  claimOnce(pageId: string, dedupeKey: string): Promise<boolean>
  findPage(pageId: string): Promise<PageOwner | null>
  loadBundle(tenantId: string, now: Date): Promise<StoreBundle | null>
  /** Just the staff-takeover setting (a staff echo needs nothing else). */
  loadTakeoverMinutes(tenantId: string): Promise<number>
  /** "TEST 123456" guesses per store are limited (10 per 10 minutes). */
  allowTesterAttempt(tenantId: string): Promise<boolean>
  touchSession(input: { tenantId: string; pageId: string; psid: string; now: Date; isInbound: boolean }): Promise<MessengerSession | null>
  setBotPause(sessionId: string, until: Date | null): Promise<boolean>
  send(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult>
  answerOrderReferral(input: { orderId: string; pageId: string; senderId: string }): Promise<{ outcome: string }>
  createLinkToken(sessionId: string): string | null
  linkTester(tenantId: string, psid: string): Promise<boolean>
  /** Read the session's chat cart, apply `op` (null = just read), drop what can't be ordered, store it. Null = unreadable. */
  changeCart(input: { sessionId: string; op: CartOp | null; store: ReplyStore }): Promise<ChatCartView | null>
  /** This customer's newest orders at this store (platform orders only). */
  loadRecentOrders(input: { tenantId: string; psid: string; store: ReplyStore; now: Date }): Promise<ReplyOrder[]>
}

export type EventOutcome =
  | 'duplicate' | 'unknown_page' | 'referral' | 'own_echo' | 'staff_command' | 'staff_paused' | 'staff_ignored'
  | 'nothing_to_answer' | 'no_store' | 'tester_linked' | 'tester_failed' | 'bot_off' | 'no_match' | 'paused'
  | 'replied' | 'send_failed'

/** When staff keep typing, the bot stays quiet at least this long. */
const MIN_STAFF_PAUSE_MINUTES = 60
const MINUTE_MS = 60 * 1000

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
}

function needsFor(action: RuleAction): ReplyNeeds | undefined {
  if (action.kind === 'cart') return { cart: 'read' }
  if (action.kind === 'order_status') return { orders: true }
  return undefined
}

function fromAction(action: RuleAction, isTyped: boolean): ReplyDecision {
  return { build: (ctx) => buildReply(action, ctx), pausesBot: action.kind === 'talk_to_staff', isTyped, needs: needsFor(action) }
}

const CART_VERB_OPS = { add: 'add', inc: 'inc', dec: 'dec', rm: 'remove' } as const

function tap(build: ReplyDecision['build'], needs?: ReplyNeeds): ReplyDecision {
  return { build, pausesBot: false, isTyped: false, needs }
}

function getStartedAction(rules: readonly MessengerRule[]): RuleAction {
  return findEnabledRule(rules, (rule) => rule.trigger.kind === 'get_started')?.action ?? { kind: 'menu_card' }
}

function fromPayload(payload: MessengerPayload, rules: readonly MessengerRule[]): ReplyDecision {
  switch (payload.verb) {
    case 'start':
      return fromAction(getStartedAction(rules), false)
    case 'rule': {
      // A starter question or menu button whose rule was since removed still gets an answer.
      const rule = findEnabledRule(rules, (entry) => entry.id === payload.ruleId)
      return fromAction(rule?.action ?? { kind: 'menu_card' }, false)
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
      return rule ? fromAction(rule.action, true) : null
    }
    case 'quick_reply': {
      const payload = decodePayload(event.payload)
      if (payload) return fromPayload(payload, rules)
      const rule = pickRuleForText(rules, event.text)
      return rule ? fromAction(rule.action, true) : null
    }
    case 'postback': {
      const payload = decodePayload(event.payload)
      return payload ? fromPayload(payload, rules) : null
    }
    case 'referral':
      // A link into the chat that is not an order: greet like Get Started.
      return fromAction(getStartedAction(rules), false)
    default:
      return null
  }
}

async function handleEcho(event: Extract<InboundEvent, { kind: 'echo' }>, page: PageOwner, deps: WebhookDeps, now: Date): Promise<EventOutcome> {
  const isOurs = event.metadata === deps.botMetadata || (deps.ourAppId !== null && event.appId === deps.ourAppId)
  if (isOurs) return 'own_echo'

  const command = readStaffCommand(event.text)
  if (command) {
    const bundle = await deps.loadBundle(page.tenantId, now)
    if (!bundle?.store) return 'no_store'
    const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: false })
    const ctx: ReplyContext = { store: bundle.store, linkToken: session ? deps.createLinkToken(session.id) : null, messages: bundle.settings.messages }
    const result = await deps.send(page.token, event.psid, buildReply(command, ctx))
    return result.ok ? 'staff_command' : 'send_failed'
  }

  // A person (Page Inbox, Business Suite) or another tool replied: step back.
  const minutes = await deps.loadTakeoverMinutes(page.tenantId)
  if (minutes <= 0) return 'staff_ignored'
  const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: false })
  if (!session) return 'staff_ignored'
  await deps.setBotPause(session.id, new Date(now.getTime() + minutes * MINUTE_MS))
  return 'staff_paused'
}

/** Fill the context with what the reply shows. A failed read leaves it out; the builders say so. */
async function loadNeeds(
  ctx: ReplyContext,
  needs: ReplyNeeds | undefined,
  input: { session: MessengerSession | null; bundle: StoreBundle; psid: string; now: Date; deps: WebhookDeps },
): Promise<void> {
  if (!needs || !input.session) return
  const { session, bundle, deps } = input
  const store = ctx.store
  const [cart, orders] = await Promise.all([
    needs.cart
      ? deps.changeCart({ sessionId: session.id, op: needs.cart === 'read' ? null : needs.cart, store }).catch(() => null)
      : Promise.resolve(null),
    needs.orders && bundle.isPlatformOrders
      ? deps.loadRecentOrders({ tenantId: bundle.tenantId, psid: input.psid, store, now: input.now }).catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  if (cart) {
    ctx.cart = needs.cart !== 'read' && needs.cart && 'itemId' in needs.cart ? { ...cart, itemId: needs.cart.itemId } : cart
  }
  // Convex / per-store Supabase stores: their orders aren't on this database.
  if (needs.orders) ctx.orders = bundle.isPlatformOrders ? orders : null
}

export async function handleEvent(event: InboundEvent, deps: WebhookDeps): Promise<EventOutcome> {
  if (!(await deps.claimOnce(event.pageId, event.dedupeKey))) return 'duplicate'
  const page = await deps.findPage(event.pageId)
  if (!page) return 'unknown_page'
  const now = deps.now()

  if (event.kind === 'referral') {
    const orderId = orderIdFromRef(event.ref)
    if (orderId) {
      await deps.answerOrderReferral({ orderId, pageId: event.pageId, senderId: event.psid })
      await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: true })
      return 'referral'
    }
  }

  if (event.kind === 'echo') return handleEcho(event, page, deps, now)

  const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: true })
  if (event.kind === 'other') return 'nothing_to_answer'

  const bundle = await deps.loadBundle(page.tenantId, now)
  if (!bundle) return 'no_store'

  if (event.kind === 'text') {
    const code = readTesterCode(event.text)
    if (code && bundle.settings.testerCodeHash && await deps.allowTesterAttempt(page.tenantId) && isTesterCodeValid({
      tenantId: page.tenantId, code, storedHash: bundle.settings.testerCodeHash, expiresAt: bundle.settings.testerCodeExpiresAt, now,
    })) {
      const linked = await deps.linkTester(page.tenantId, event.psid)
      await deps.send(page.token, event.psid, [{
        kind: 'text',
        text: linked
          ? '✅ Linked! Test messages from your Messenger automations will arrive here.'
          : "Couldn't link this chat. Please get a new code from the editor and try again.",
      }])
      return linked ? 'tester_linked' : 'tester_failed'
    }
  }

  if (!bundle.settings.botEnabled) return 'bot_off'
  if (!bundle.store) return 'no_store'

  const decision = decideReply(event, bundle.rules)
  if (!decision) return 'no_match'
  const isPaused = session?.botPausedUntil !== null && session?.botPausedUntil !== undefined && session.botPausedUntil.getTime() > now.getTime()
  if (isPaused && decision.isTyped) return 'paused'

  const ctx: ReplyContext = { store: bundle.store, linkToken: session ? deps.createLinkToken(session.id) : null, messages: bundle.settings.messages }
  await loadNeeds(ctx, decision.needs, { session, bundle, psid: event.psid, now, deps })
  const messages = decision.build(ctx)
  if (decision.pausesBot && session) {
    const minutes = Math.max(bundle.settings.takeoverMinutes, MIN_STAFF_PAUSE_MINUTES)
    await deps.setBotPause(session.id, new Date(now.getTime() + minutes * MINUTE_MS))
  }
  const result = await deps.send(page.token, event.psid, messages)
  return result.ok ? 'replied' : 'send_failed'
}
