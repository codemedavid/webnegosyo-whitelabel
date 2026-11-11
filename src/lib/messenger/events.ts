/**
 * Meta's webhook body → one typed event per messaging item.
 *
 * Parsing is lenient by design: Meta adds fields without notice, so unknown
 * keys pass and one malformed item is dropped without failing the rest of the
 * batch. Events come back ordered by Meta's `timestamp`, not by arrival
 * (Meta's webhook docs: "order by timestamp").
 */

import { z } from 'zod'

const refSchema = z.object({ ref: z.string().max(2083).optional() }).passthrough()

const messagingSchema = z.object({
  sender: z.object({ id: z.string().min(1).max(64) }),
  recipient: z.object({ id: z.string().min(1).max(64) }),
  timestamp: z.number().optional(),
  referral: refSchema.optional(),
  message: z
    .object({
      mid: z.string().max(400).optional(),
      text: z.string().optional(),
      is_echo: z.boolean().optional(),
      app_id: z.union([z.number(), z.string()]).optional(),
      metadata: z.string().optional(),
      quick_reply: z.object({ payload: z.string().max(1000) }).optional(),
      referral: refSchema.optional(),
      attachments: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
  postback: z
    .object({
      mid: z.string().max(400).optional(),
      title: z.string().optional(),
      payload: z.string().max(1000).optional(),
      referral: refSchema.optional(),
    })
    .passthrough()
    .optional(),
}).passthrough()

const bodySchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ id: z.string(), messaging: z.array(z.unknown()).optional() }).passthrough()).optional(),
}).passthrough()

interface EventBase {
  /** The Page the event belongs to (`entry.id`). */
  pageId: string
  /** The customer. For an echo this is the RECIPIENT, never the Page. */
  psid: string
  timestamp: number
  /** Stable id for dedupe: Meta's `mid`, else a digest of the event. */
  dedupeKey: string
}

export type InboundEvent =
  | (EventBase & { kind: 'text'; text: string })
  | (EventBase & { kind: 'quick_reply'; text: string; payload: string })
  | (EventBase & { kind: 'postback'; payload: string; title: string })
  | (EventBase & { kind: 'referral'; ref: string })
  /** Something the Page sent: our bot, Page Inbox staff, or another tool. */
  | (EventBase & { kind: 'echo'; text: string; appId: string | null; metadata: string | null })
  /** A sticker, photo, like… The customer reached out (it opens the window) but there is nothing to match. */
  | (EventBase & { kind: 'other'; attachment: AttachmentKind })

export type InboundEventKind = InboundEvent['kind']

/** What a message without text carried (the chat log says "📷 Photo"; media is never stored). */
export type AttachmentKind = 'photo' | 'sticker' | 'video' | 'audio' | 'file' | 'location' | 'other'

const attachmentSchema = z.object({
  type: z.string().optional(),
  payload: z.object({ sticker_id: z.union([z.number(), z.string()]).optional() }).passthrough().nullish(),
}).passthrough()

function attachmentKind(attachments: unknown[] | undefined): AttachmentKind {
  const parsed = attachmentSchema.safeParse(attachments?.[0])
  if (!parsed.success) return 'other'
  if (parsed.data.payload?.sticker_id !== undefined) return 'sticker'
  switch (parsed.data.type) {
    case 'image': return 'photo'
    case 'video': return 'video'
    case 'audio': return 'audio'
    case 'file': return 'file'
    case 'location': return 'location'
    default: return 'other'
  }
}

function dedupeKeyFor(mid: string | undefined, fallback: string): string {
  return mid ? `mid:${mid}` : fallback
}

function toEvent(pageId: string, raw: unknown): InboundEvent | null {
  const parsed = messagingSchema.safeParse(raw)
  if (!parsed.success) return null
  const item = parsed.data
  const timestamp = item.timestamp ?? 0
  const message = item.message

  if (message?.is_echo) {
    return {
      kind: 'echo',
      pageId,
      psid: item.recipient.id,
      timestamp,
      dedupeKey: dedupeKeyFor(message.mid, `echo:${item.recipient.id}:${timestamp}`),
      text: message.text ?? '',
      appId: message.app_id === undefined ? null : String(message.app_id),
      metadata: message.metadata ?? null,
    }
  }

  const base = { pageId, psid: item.sender.id, timestamp }
  // A referral wins over the text or Get Started it rides on: an m.me link from
  // checkout must answer with the order, not with a welcome card.
  const ref = item.referral?.ref ?? message?.referral?.ref ?? item.postback?.referral?.ref
  if (ref) {
    return { ...base, kind: 'referral', ref, dedupeKey: dedupeKeyFor(message?.mid ?? item.postback?.mid, `ref:${item.sender.id}:${timestamp}:${ref}`) }
  }

  if (item.postback) {
    return {
      ...base,
      kind: 'postback',
      payload: item.postback.payload ?? '',
      title: item.postback.title ?? '',
      dedupeKey: dedupeKeyFor(item.postback.mid, `pb:${item.sender.id}:${timestamp}:${item.postback.payload ?? ''}`),
    }
  }

  if (message) {
    const dedupeKey = dedupeKeyFor(message.mid, `msg:${item.sender.id}:${timestamp}`)
    if (message.quick_reply) {
      return { ...base, kind: 'quick_reply', text: message.text ?? '', payload: message.quick_reply.payload, dedupeKey }
    }
    if (message.text && message.text.trim().length > 0) {
      return { ...base, kind: 'text', text: message.text, dedupeKey }
    }
    return { ...base, kind: 'other', attachment: attachmentKind(message.attachments), dedupeKey }
  }

  // Reads, deliveries, reactions: not something to answer.
  return null
}

/**
 * Every answerable event in a webhook body, oldest first. `null` when the body
 * is not a Page subscription (the route answers 404, as before).
 */
export function parseWebhookBody(body: unknown): InboundEvent[] | null {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success || parsed.data.object !== 'page') return null

  const events: InboundEvent[] = []
  for (const entry of parsed.data.entry ?? []) {
    for (const raw of entry.messaging ?? []) {
      const event = toEvent(entry.id, raw)
      if (event) events.push(event)
    }
  }
  return events.sort((a, b) => a.timestamp - b.timestamp)
}
