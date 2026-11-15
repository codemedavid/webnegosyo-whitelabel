/**
 * `/api/messenger/chat`: staff replying from the merchant app (plan
 * `docs/plans/2026-11-15-messenger-reply-from-app.md`, C4). The route checks
 * who is calling; this decides and does the rest through injected deps, so
 * every refusal and every write is testable without Meta or a database.
 *
 * Order of checks for a send: the caller can read this chat (as themselves,
 * RLS) → the store runs on WebNegosyo orders and has a Page → the 24-hour
 * window is open → the card is one this chat offers → this tap was not sent
 * already → send → log what went out (named) → a typed reply pauses the bot.
 */

import type { ChatLogLine } from './chat-log'
import { botLine } from './chat-log'
import type { OutgoingMessage } from './graph-message'
import type { SendResult } from './send'
import type { StaffChatFacts } from './staff-chat-deps'
import {
  isOfferedCard,
  pauseAfterReply,
  refusalFor,
  replyWindow,
  staffAppLine,
  staffChips,
  type StaffCard,
  type StaffChatBody,
  type StaffChatRefusal,
  type StaffChip,
} from './staff-chat'

/** "Pause bot" when the store never pauses on a reply (takeover 0): an hour. */
const MANUAL_PAUSE_FALLBACK_MINUTES = 60

export interface StaffChatDeps {
  now(): Date
  /** Can the CALLER read this chat (their own session client, RLS)? */
  canReadChat(tenantId: string, sessionId: string): Promise<boolean>
  loadFacts(tenantId: string, sessionId: string, now: Date): Promise<StaffChatFacts | null>
  buildCard(facts: StaffChatFacts, card: StaffCard): Promise<OutgoingMessage[]>
  pageToken(facts: StaffChatFacts): Promise<string | null>
  claimSend(sessionId: string, clientId: string): Promise<boolean>
  releaseSend(sessionId: string, clientId: string): Promise<void>
  send(token: string, psid: string, messages: readonly OutgoingMessage[]): Promise<SendResult>
  setBotPause(sessionId: string, until: Date | null): Promise<boolean>
  writeLog(input: { tenantId: string; sessionId: string; lines: readonly ChatLogLine[] }): Promise<void>
  /** A person answered: the chat leaves "Needs a reply". Never throws. */
  clearNeedsReply(sessionId: string): Promise<void>
  /** The summary went out again after a change: its Confirm button works again. Never throws. */
  reopenChatOrder(tenantId: string, orderId: string, now: Date): Promise<void>
}

export interface StaffChatCaller {
  userId: string
}

export interface StaffChatResponse {
  status: number
  body: Record<string, unknown>
}

const refused = (reason: StaffChatRefusal): StaffChatResponse => {
  const { status, ...body } = refusalFor(reason)
  return { status, body }
}

const NOT_FOUND: StaffChatResponse = { status: 404, body: { error: 'Chat not found.' } }

/** Why nothing can be sent from this chat at all, or null. */
function blockedReason(facts: StaffChatFacts): StaffChatRefusal | null {
  if (!facts.bundle.isPlatformOrders) return 'not_platform'
  if (!facts.bundle.facebookPageRowId) return 'no_page'
  return null
}

function chipsFor(facts: StaffChatFacts, now: Date): StaffChip[] {
  if (blockedReason(facts)) return []
  return staffChips({
    window: replyWindow(facts.session.lastInboundAt, now),
    cartCount: facts.cart?.priced.itemCount ?? 0,
    cartTotalCentavos: facts.cart?.priced.totalCentavos ?? 0,
    hasCategories: (facts.bundle.store?.categories.length ?? 0) > 0,
    order: facts.order,
  })
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null)

function activePause(facts: StaffChatFacts, now: Date): Date | null {
  const until = facts.session.botPausedUntil
  return until && until.getTime() > now.getTime() ? until : null
}

function describeTools(facts: StaffChatFacts, now: Date): Record<string, unknown> {
  const window = replyWindow(facts.session.lastInboundAt, now)
  const order = facts.order
  return {
    blocked: blockedReason(facts),
    window: { isOpen: window.isOpen, endsAt: iso(window.endsAt) },
    bot: {
      enabled: facts.bundle.settings.botEnabled,
      pausedUntil: iso(activePause(facts, now)),
      takeoverMinutes: facts.bundle.settings.takeoverMinutes,
    },
    cart: facts.cart && facts.cart.priced.itemCount > 0
      ? { count: facts.cart.priced.itemCount, totalCentavos: facts.cart.priced.totalCentavos }
      : null,
    order: order ? { id: order.id, label: order.label, status: order.status, isPaid: order.isPaid, isChatOrder: order.isChatOrder } : null,
    chips: chipsFor(facts, now),
  }
}

async function safeLog(deps: StaffChatDeps, facts: StaffChatFacts, line: ChatLogLine | null): Promise<void> {
  if (!line) return
  try {
    await deps.writeLog({ tenantId: facts.bundle.tenantId, sessionId: facts.session.id, lines: [line] })
  } catch (error) {
    // The message reached the customer; a missing log line must not report a failed send.
    console.error('[Messenger] staff reply not logged:', error instanceof Error ? error.message : error)
  }
}

/** Claim this tap, send, and give the claim back when nothing went out. */
async function sendOnce(
  deps: StaffChatDeps,
  facts: StaffChatFacts,
  clientId: string,
  messages: readonly OutgoingMessage[],
): Promise<{ ok: true; result: Extract<SendResult, { ok: true }> } | { ok: false; response: StaffChatResponse }> {
  const token = await deps.pageToken(facts)
  if (!token) return { ok: false, response: refused('no_page') }
  if (!(await deps.claimSend(facts.session.id, clientId))) {
    return { ok: false, response: { status: 200, body: { status: 'already_sent' } } }
  }
  const result = await deps.send(token, facts.session.psid, messages)
  if (!result.ok) {
    if (result.sent === 0) await deps.releaseSend(facts.session.id, clientId)
    console.error('[Messenger] staff reply refused by Meta', { code: result.error.code, subcode: result.error.subcode, sent: result.sent })
    return { ok: false, response: refused('send_failed') }
  }
  await deps.clearNeedsReply(facts.session.id)
  return { ok: true, result }
}

export async function handleStaffChat(body: StaffChatBody, caller: StaffChatCaller, deps: StaffChatDeps): Promise<StaffChatResponse> {
  if (!(await deps.canReadChat(body.tenantId, body.sessionId))) return NOT_FOUND
  const now = deps.now()
  const facts = await deps.loadFacts(body.tenantId, body.sessionId, now)
  if (!facts) return NOT_FOUND

  if (body.action === 'tools') return { status: 200, body: describeTools(facts, now) }

  const blocked = blockedReason(facts)
  if (blocked) return refused(blocked)

  if (body.action === 'bot') {
    const minutes = facts.bundle.settings.takeoverMinutes > 0 ? facts.bundle.settings.takeoverMinutes : MANUAL_PAUSE_FALLBACK_MINUTES
    const until = body.pause ? new Date(now.getTime() + minutes * 60_000) : null
    if (!(await deps.setBotPause(facts.session.id, until))) return { status: 500, body: { error: 'Could not change the bot. Try again.' } }
    return { status: 200, body: { pausedUntil: iso(until) } }
  }

  const window = replyWindow(facts.session.lastInboundAt, now)
  if (!window.isOpen) return refused('window_closed')

  if (body.action === 'send_text') {
    const message: OutgoingMessage = { kind: 'text', text: body.text }
    const sent = await sendOnce(deps, facts, body.clientId, [message])
    if (!sent.ok) return sent.response
    await safeLog(deps, facts, staffAppLine(body.text, { mid: sent.result.messageIds?.[0] ?? null, sentBy: caller.userId, now }))
    const pauseUntil = pauseAfterReply({ takeoverMinutes: facts.bundle.settings.takeoverMinutes, pausedUntil: facts.session.botPausedUntil, now })
    // A pause that wasn't stored is logged by setBotPause; the reply itself went out.
    if (pauseUntil) await deps.setBotPause(facts.session.id, pauseUntil)
    return { status: 200, body: { status: 'sent', pausedUntil: iso(pauseUntil ?? activePause(facts, now)) } }
  }

  // preview / send_card
  if (!isOfferedCard(chipsFor(facts, now), body.card, body.orderId)) return refused('not_offered')
  const messages = await deps.buildCard(facts, body.card)
  if (messages.length === 0) return refused('nothing_to_send')
  if (body.action === 'preview') return { status: 200, body: { messages } }

  const sent = await sendOnce(deps, facts, body.clientId, messages)
  if (!sent.ok) return sent.response
  const line = botLine(messages, now)
  // Quick actions never pause the bot (like /menu in Page Inbox).
  await safeLog(deps, facts, line ? { ...line, mid: sent.result.messageIds?.[0] ?? null, sentBy: caller.userId } : null)
  if (body.card === 'summary' && facts.order) await deps.reopenChatOrder(facts.bundle.tenantId, facts.order.id, now)
  return { status: 200, body: { status: 'sent' } }
}
