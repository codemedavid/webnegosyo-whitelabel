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
 *
 * Every event that reaches a store also leaves a line in the chat log
 * (`chat-log.ts`): what the customer did, what staff typed, a summary of what
 * the bot sent. Our own echoes and the owner's test code are never logged.
 * The customer's Messenger name is fetched once a month (`needsProfile`) for
 * `{name}` and the merchant app; a failed fetch only means no name.
 */

import type { OutgoingMessage } from './graph-message'
import type { InboundEvent } from './events'
import type { StoreBundle } from './settings'
import { buildReply, type ChatCartView, type ReplyContext } from './replies'
import type { CartOp } from './chat-cart'
import type { ReplyOrder } from './order-view'
import type { ReplyStore } from './store-view'
import { decideReply, readStaffCommand, type ReplyNeeds } from './decide'
import { orderIdFromRef } from './ref'
import type { MessengerSession } from './session'
import type { SendResult } from './send'
import { isTesterCodeValid, readTesterCode } from './tester'
import { botLine, customerLine, needsProfile, staffLine, type ChatLogLine } from './chat-log'
import { greetingName } from './messages/fill'

// The pure decision lives in `decide.ts` (also run in the browser by the Studio's chat simulator).
export { decideReply, readStaffCommand, type ReplyDecision, type ReplyNeeds } from './decide'

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
  /** Store this event's chat lines. Never throws. */
  logChat(input: { tenantId: string; sessionId: string; lines: readonly ChatLogLine[] }): Promise<void>
  /** Fetch + store the customer's Messenger profile; the raw first name, or null. Never throws. */
  refreshProfile(input: { sessionId: string; token: string; psid: string; now: Date }): Promise<string | null>
}

/** The chat lines one event leaves, written once when it is handled. */
interface ChatRecord {
  session: MessengerSession | null
  lines: ChatLogLine[]
}

/** Lines keep the order they happened in, even when two share a clock tick. */
function record(chat: ChatRecord, line: ChatLogLine | null) {
  if (!line) return
  const previous = chat.lines[chat.lines.length - 1]
  const sentAt = previous && line.sentAt.getTime() <= previous.sentAt.getTime() ? new Date(previous.sentAt.getTime() + 1) : line.sentAt
  chat.lines.push({ ...line, sentAt })
}

export type EventOutcome =
  | 'duplicate' | 'unknown_page' | 'referral' | 'own_echo' | 'staff_command' | 'staff_paused' | 'staff_ignored'
  | 'nothing_to_answer' | 'no_store' | 'tester_linked' | 'tester_failed' | 'bot_off' | 'no_match' | 'paused'
  | 'replied' | 'send_failed'

/** When staff keep typing, the bot stays quiet at least this long. */
const MIN_STAFF_PAUSE_MINUTES = 60
const MINUTE_MS = 60 * 1000

async function handleEcho(
  event: Extract<InboundEvent, { kind: 'echo' }>, page: PageOwner, deps: WebhookDeps, now: Date, chat: ChatRecord,
): Promise<EventOutcome> {
  // Our own sends are logged as a summary when they go out, not as their echoes.
  const isOurs = event.metadata === deps.botMetadata || (deps.ourAppId !== null && event.appId === deps.ourAppId)
  if (isOurs) return 'own_echo'

  const command = readStaffCommand(event.text)
  if (command) {
    const bundle = await deps.loadBundle(page.tenantId, now)
    if (!bundle?.store) return 'no_store'
    const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: false })
    chat.session = session
    record(chat, staffLine(event, now))
    const ctx: ReplyContext = {
      store: bundle.store, linkToken: session ? deps.createLinkToken(session.id) : null, messages: bundle.settings.messages,
      customerName: greetingName(session?.firstName),
    }
    const messages = buildReply(command, ctx)
    const result = await deps.send(page.token, event.psid, messages)
    if (result.ok) record(chat, botLine(messages, deps.now()))
    return result.ok ? 'staff_command' : 'send_failed'
  }

  // A person (Page Inbox, Business Suite) or another tool replied: step back.
  const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: false })
  chat.session = session
  record(chat, staffLine(event, now))
  const minutes = await deps.loadTakeoverMinutes(page.tenantId)
  if (minutes <= 0 || !session) return 'staff_ignored'
  await deps.setBotPause(session.id, new Date(now.getTime() + minutes * MINUTE_MS))
  return 'staff_paused'
}

/** The customer's first name for `{name}`: stored, else fetched when due. */
async function customerFirstName(session: MessengerSession | null, page: PageOwner, psid: string, now: Date, deps: WebhookDeps): Promise<string> {
  if (!session) return ''
  if (!needsProfile(session, now)) return greetingName(session.firstName)
  const fetched = await deps.refreshProfile({ sessionId: session.id, token: page.token, psid, now }).catch(() => null)
  return greetingName(fetched ?? session.firstName)
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

  const chat: ChatRecord = { session: null, lines: [] }
  try {
    return await answer(event, page, deps, now, chat)
  } finally {
    if (chat.session && chat.lines.length > 0) {
      await deps.logChat({ tenantId: page.tenantId, sessionId: chat.session.id, lines: chat.lines }).catch(() => undefined)
    }
  }
}

async function answer(event: InboundEvent, page: PageOwner, deps: WebhookDeps, now: Date, chat: ChatRecord): Promise<EventOutcome> {
  if (event.kind === 'referral') {
    const orderId = orderIdFromRef(event.ref)
    if (orderId) {
      const answered = await deps.answerOrderReferral({ orderId, pageId: event.pageId, senderId: event.psid })
      const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: true })
      chat.session = session
      record(chat, customerLine(event, now))
      if (answered.outcome === 'sent') record(chat, botLine([{ kind: 'text', text: '🧾 Sent the order summary' }], deps.now()))
      await customerFirstName(session, page, event.psid, now, deps)
      return 'referral'
    }
  }

  if (event.kind === 'echo') return handleEcho(event, page, deps, now, chat)

  const session = await deps.touchSession({ tenantId: page.tenantId, pageId: event.pageId, psid: event.psid, now, isInbound: true })
  chat.session = session
  record(chat, customerLine(event, now))
  const customerName = await customerFirstName(session, page, event.psid, now, deps)
  if (event.kind === 'other') return 'nothing_to_answer'

  const bundle = await deps.loadBundle(page.tenantId, now)
  if (!bundle) return 'no_store'

  if (event.kind === 'text') {
    const code = readTesterCode(event.text)
    if (code && bundle.settings.testerCodeHash && await deps.allowTesterAttempt(page.tenantId) && isTesterCodeValid({
      tenantId: page.tenantId, code, storedHash: bundle.settings.testerCodeHash, expiresAt: bundle.settings.testerCodeExpiresAt, now,
    })) {
      // The owner linking their own Messenger: not part of any customer chat.
      chat.lines.length = 0
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

  const ctx: ReplyContext = {
    store: bundle.store, linkToken: session ? deps.createLinkToken(session.id) : null, messages: bundle.settings.messages, customerName,
  }
  await loadNeeds(ctx, decision.needs, { session, bundle, psid: event.psid, now, deps })
  const messages = decision.build(ctx)
  if (decision.pausesBot && session) {
    const minutes = Math.max(bundle.settings.takeoverMinutes, MIN_STAFF_PAUSE_MINUTES)
    await deps.setBotPause(session.id, new Date(now.getTime() + minutes * MINUTE_MS))
  }
  const result = await deps.send(page.token, event.psid, messages)
  if (result.ok) record(chat, botLine(messages, deps.now()))
  return result.ok ? 'replied' : 'send_failed'
}
