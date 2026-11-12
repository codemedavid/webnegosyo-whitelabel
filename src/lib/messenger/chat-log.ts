/**
 * What goes into the chat log (`messenger_messages`, plan B1): one short line
 * per thing said, so the merchant app can show the chat around an order.
 *
 *   customer  their text, the title of a button they tapped, "📷 Photo" for an
 *             attachment (media is never stored)
 *   bot       a summary of what we sent ("Sent 5 dishes: …"), never the links
 *   staff     what a person typed in Page Inbox
 *
 * Pure: the webhook decides WHEN to log (`handle-event.ts`), the store writes.
 */

import type { AttachmentKind, InboundEvent } from './events'
import type { OutgoingMessage } from './graph-message'
import { orderIdFromRef } from './ref'

export type ChatDirection = 'in' | 'bot' | 'staff'
export type ChatLineKind = 'text' | 'tap' | 'photo' | 'sticker' | 'card' | 'other'

export interface ChatLogLine {
  direction: ChatDirection
  kind: ChatLineKind
  /** 1–1,000 characters. */
  body: string
  /** Meta's message id (a retried webhook never logs twice); null for our summaries. */
  mid: string | null
  sentAt: Date
}

export const CHAT_LINE_MAX = 1000
export const CHAT_PREVIEW_MAX = 120

/** At most `max` characters (code points, as Postgres counts them), with an ellipsis when cut. */
export function clipText(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/** One line for a list row: whitespace folded, ≤120 characters. */
export function chatPreview(line: Pick<ChatLogLine, 'body'>): string {
  return clipText(line.body.replace(/\s+/g, ' ').trim(), CHAT_PREVIEW_MAX)
}

const ATTACHMENT_TEXT: Record<AttachmentKind, { kind: ChatLineKind; body: string }> = {
  photo: { kind: 'photo', body: '📷 Photo' },
  sticker: { kind: 'sticker', body: '👍 Sticker' },
  video: { kind: 'other', body: '🎥 Video' },
  audio: { kind: 'other', body: '🎤 Voice message' },
  file: { kind: 'other', body: '📎 File' },
  location: { kind: 'other', body: '📍 Location' },
  other: { kind: 'other', body: '💬 Sent something' },
}

function midOf(dedupeKey: string): string | null {
  return dedupeKey.startsWith('mid:') ? clipText(dedupeKey.slice(4), 400) : null
}

function sentAtOf(timestamp: number, now: Date): Date {
  return timestamp > 0 ? new Date(timestamp) : now
}

function line(direction: ChatDirection, kind: ChatLineKind, body: string, mid: string | null, sentAt: Date): ChatLogLine | null {
  const text = clipText(body.trim(), CHAT_LINE_MAX)
  return text ? { direction, kind, body: text, mid, sentAt } : null
}

/** What the customer did, or null when there is nothing to show (an empty text). */
export function customerLine(event: InboundEvent, now: Date): ChatLogLine | null {
  const mid = midOf(event.dedupeKey)
  const sentAt = sentAtOf(event.timestamp, now)
  switch (event.kind) {
    case 'text':
      return line('in', 'text', event.text, mid, sentAt)
    case 'quick_reply':
      return line('in', 'tap', event.text || 'Tapped a reply', mid, sentAt)
    case 'postback':
      return line('in', 'tap', event.title || 'Tapped a button', mid, sentAt)
    case 'referral':
      return line('in', 'other', orderIdFromRef(event.ref) ? '↪ Opened the chat from their order' : '↪ Opened the chat from a link', mid, sentAt)
    case 'other': {
      const shown = ATTACHMENT_TEXT[event.attachment] ?? ATTACHMENT_TEXT.other
      return line('in', shown.kind, shown.body, mid, sentAt)
    }
    case 'echo':
      return null
  }
}

/** A person (Page Inbox, Business Suite) replying from the Page. */
export function staffLine(event: Extract<InboundEvent, { kind: 'echo' }>, now: Date): ChatLogLine | null {
  return line('staff', event.text.trim() ? 'text' : 'other', event.text.trim() || '📎 Attachment', midOf(event.dedupeKey), sentAtOf(event.timestamp, now))
}

function summarizeMessage(message: OutgoingMessage): string {
  switch (message.kind) {
    case 'text':
      return message.text
    case 'buttons':
      return message.text
    case 'cards': {
      const titles = message.cards.map((card) => card.title).filter(Boolean)
      if (titles.length === 1) return `🗂 Sent: ${titles[0]}`
      const shown = titles.slice(0, 3).join(', ')
      return `🗂 Sent ${titles.length} cards: ${shown}${titles.length > 3 ? '…' : ''}`
    }
  }
}

/** What the bot sent, as ONE line (several messages joined), or null when nothing was sent. */
export function botLine(messages: readonly OutgoingMessage[], now: Date): ChatLogLine | null {
  if (messages.length === 0) return null
  const body = messages.map(summarizeMessage).map((text) => text.trim()).filter(Boolean).join('\n')
  const kind: ChatLineKind = messages.some((message) => message.kind === 'cards') ? 'card' : 'text'
  return line('bot', kind, body, null, now)
}

const DAY_MS = 24 * 60 * 60 * 1000
/** A name we have is refreshed monthly; a failed fetch is retried the next day. */
const PROFILE_REFRESH_MS = 30 * DAY_MS
const PROFILE_RETRY_MS = DAY_MS

/** True when the customer's Messenger profile should be (re)fetched. */
export function needsProfile(session: { firstName: string | null; profileFetchedAt: Date | null }, now: Date): boolean {
  if (!session.profileFetchedAt) return true
  const age = now.getTime() - session.profileFetchedAt.getTime()
  return age >= (session.firstName ? PROFILE_REFRESH_MS : PROFILE_RETRY_MS)
}
