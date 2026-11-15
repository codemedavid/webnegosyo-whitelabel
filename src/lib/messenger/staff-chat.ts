/**
 * Staff chatting with a customer from the merchant app (plan
 * `docs/plans/2026-11-15-messenger-reply-from-app.md`, C4): a typed reply, or
 * one of the bot's own cards sent by hand ("quick actions").
 *
 * Pure: what the app may send, which quick actions apply, the 24-hour reply
 * window, and the chat-log line a reply leaves. The route
 * (`/api/messenger/chat`) reads the facts and does the sending.
 */

import { z } from 'zod'
import { CHAT_LINE_MAX, clipText, type ChatLogLine } from './chat-log'
import { formatCentavos } from './money'
import { MESSAGING_WINDOW_MS, type OrderStatus } from './order-view'

/** One reply. The chat log keeps 1,000 characters per line, so that is the cap (Meta allows 2,000). */
export const STAFF_TEXT_MAX = CHAT_LINE_MAX

/**
 * The cards staff can send. `summary` re-sends a waiting chat order's summary
 * with Confirm / Change; `order_status` is that order's status message.
 */
export const STAFF_CARDS = ['menu', 'categories', 'hours', 'cart', 'order_status', 'summary', 'pay'] as const
export type StaffCard = (typeof STAFF_CARDS)[number]

const uuid = z.string().uuid()
/** The app's id for one tap of Send: a retry after a timeout never sends twice. */
const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)
const card = z.enum(STAFF_CARDS)

export const staffChatBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tools'), tenantId: uuid, sessionId: uuid }).strict(),
  z.object({ action: z.literal('preview'), tenantId: uuid, sessionId: uuid, card, orderId: uuid.optional() }).strict(),
  z.object({ action: z.literal('send_card'), tenantId: uuid, sessionId: uuid, clientId, card, orderId: uuid.optional() }).strict(),
  z.object({ action: z.literal('send_text'), tenantId: uuid, sessionId: uuid, clientId, text: z.string().trim().min(1).max(STAFF_TEXT_MAX) }).strict(),
  z.object({ action: z.literal('bot'), tenantId: uuid, sessionId: uuid, pause: z.boolean() }).strict(),
])
export type StaffChatBody = z.infer<typeof staffChatBodySchema>

// ── The 24-hour window ───────────────────────────────────────────────────────

export interface ReplyWindow {
  isOpen: boolean
  /** When the store can no longer reply; null when the customer never wrote. */
  endsAt: Date | null
}

/** Meta lets a Page reply freely for 24 hours after the customer's last message. */
export function replyWindow(lastInboundAt: Date | null, now: Date): ReplyWindow {
  if (!lastInboundAt) return { isOpen: false, endsAt: null }
  const endsAt = new Date(lastInboundAt.getTime() + MESSAGING_WINDOW_MS)
  return { isOpen: endsAt.getTime() > now.getTime(), endsAt }
}

// ── Which quick actions apply ────────────────────────────────────────────────

/** The customer's newest order at this store, as the quick actions need it. */
export interface StaffOrderFacts {
  id: string
  /** "#07" */
  label: string
  status: OrderStatus
  isPaid: boolean
  /** Rung up from this chat and waiting for the customer's Confirm (a `messenger_chat_orders` row). */
  isChatOrder: boolean
  /** Active payment methods for its order type. */
  payMethodCount: number
}

export interface StaffChipInput {
  window: ReplyWindow
  /** Dishes in their chat cart (0 = none or unreadable). */
  cartCount: number
  cartTotalCentavos: number
  hasCategories: boolean
  order: StaffOrderFacts | null
}

export interface StaffChip {
  card: StaffCard
  label: string
  orderId?: string
}

const STATUS_WORDS: Record<OrderStatus, string> = {
  pending: 'Waiting',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Done',
  cancelled: 'Cancelled',
}

/**
 * The quick actions for this chat, in the order the app shows them. None
 * outside the 24-hour window: nothing could be sent.
 */
export function staffChips(input: StaffChipInput): StaffChip[] {
  if (!input.window.isOpen) return []
  const chips: StaffChip[] = []
  if (input.cartCount > 0) chips.push({ card: 'cart', label: `Send checkout · ${formatCentavos(input.cartTotalCentavos)}` })
  chips.push({ card: 'menu', label: 'Menu' })
  if (input.hasCategories) chips.push({ card: 'categories', label: 'Categories' })
  const order = input.order
  if (order) {
    if (order.status === 'pending') {
      if (order.isChatOrder) chips.push({ card: 'summary', label: `Resend ${order.label}`, orderId: order.id })
    } else {
      chips.push({ card: 'order_status', label: `${order.label} ${STATUS_WORDS[order.status]}`, orderId: order.id })
    }
    // Only a chat order can take the tap: the customer's GCash/Cash buttons
    // answer through its `messenger_chat_orders` row, so on a web order they
    // replied "That order is no longer open" and saved nothing.
    if (order.isChatOrder && !order.isPaid && order.status !== 'cancelled' && order.payMethodCount > 0) {
      chips.push({ card: 'pay', label: 'How to pay', orderId: order.id })
    }
  }
  chips.push({ card: 'hours', label: 'Hours & location' })
  return chips
}

/** Is this card one of the chips the chat offers right now? The route refuses anything else. */
export function isOfferedCard(chips: readonly StaffChip[], card: StaffCard, orderId: string | undefined): StaffChip | null {
  return chips.find((chip) => chip.card === card && (chip.orderId === undefined || orderId === undefined || chip.orderId === orderId)) ?? null
}

// ── What a reply leaves behind ───────────────────────────────────────────────

/** The staff line a reply from the app writes to the chat log (named, so the chat shows who). */
export function staffAppLine(text: string, input: { mid: string | null; sentBy: string; now: Date }): ChatLogLine {
  return { direction: 'staff', kind: 'text', body: clipText(text, CHAT_LINE_MAX), mid: input.mid, sentAt: input.now, sentBy: input.sentBy }
}

/**
 * A typed reply hands the chat to staff, like a reply in Page Inbox: the bot
 * stays quiet for the store's takeover time (0 = the store never pauses it).
 * A pause already running longer is never shortened.
 */
export function pauseAfterReply(input: { takeoverMinutes: number; pausedUntil: Date | null; now: Date }): Date | null {
  if (input.takeoverMinutes <= 0) return null
  const until = new Date(input.now.getTime() + input.takeoverMinutes * 60_000)
  if (input.pausedUntil && input.pausedUntil.getTime() >= until.getTime()) return null
  return until
}

// ── Refusals the app shows ───────────────────────────────────────────────────

export type StaffChatRefusal =
  | 'not_platform' | 'no_page' | 'window_closed' | 'not_offered' | 'nothing_to_send' | 'send_failed' | 'busy'

const REFUSALS: Record<StaffChatRefusal, { status: number; error: string }> = {
  not_platform: { status: 409, error: 'Replying from the app works for stores on WebNegosyo orders only.' },
  no_page: { status: 409, error: 'Your Facebook Page is not connected. Connect it in Settings → Messenger.' },
  window_closed: { status: 409, error: 'Messenger only lets you reply within 24 hours of their last message. Reply in Business Suite.' },
  not_offered: { status: 409, error: 'That can no longer be sent for this chat. Pull to refresh.' },
  nothing_to_send: { status: 409, error: 'There is nothing to send for this yet.' },
  send_failed: { status: 502, error: "Messenger didn't take it. Try again." },
  busy: { status: 429, error: 'Too many messages at once. Wait a moment and try again.' },
}

export function refusalFor(reason: StaffChatRefusal): { status: number; error: string; reason: StaffChatRefusal } {
  return { ...REFUSALS[reason], reason }
}
