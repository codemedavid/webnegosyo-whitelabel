/**
 * Orders as the chat shows them: "Where is my order" cards and the status
 * messages sent when an order moves. Pure.
 *
 * Platform orders only (`resolveOrderBackend === 'platform'`): Convex and
 * per-store Supabase orders are not in `public.orders`, so those stores answer
 * with the tracking-link text instead (owner, 2026-11-10, D7).
 */

import { z } from 'zod'
import { defaultText, UPDATE_MESSAGE_IDS } from './messages/registry'

export const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Statuses a status message can be sent for (`pending` is the order being placed). */
export const UPDATE_STATUSES = ['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type UpdateStatus = (typeof UPDATE_STATUSES)[number]

export type OrderKind = 'delivery' | 'pickup' | 'dine_in' | null

export interface ReplyOrder {
  id: string
  /** "#07" (today's number) or a short id. */
  label: string
  status: OrderStatus
  kind: OrderKind
  totalCentavos: number
  /** Absolute, signed tracking link; null when it can't be built. */
  trackingUrl: string | null
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}

/** `order_types.type` (never the renameable label), else a guess from the stored label. */
export function readOrderKind(type: string | null | undefined, label?: string | null): OrderKind {
  const value = (type || label || '').toLowerCase()
  if (value === 'delivery' || value.includes('deliver')) return 'delivery'
  if (value === 'pickup' || value.includes('pick') || value.includes('take')) return 'pickup'
  if (value === 'dine_in' || value.includes('dine')) return 'dine_in'
  return null
}

export function orderLabel(dailyNumber: number | null | undefined, id: string): string {
  return typeof dailyNumber === 'number' && dailyNumber > 0
    ? `#${String(dailyNumber).padStart(2, '0')}`
    : `#${id.slice(0, 6).toUpperCase()}`
}

export function statusLabel(status: OrderStatus, kind: OrderKind): string {
  switch (status) {
    case 'pending': return 'Received'
    case 'confirmed': return 'Confirmed'
    case 'preparing': return 'Preparing'
    case 'ready':
      if (kind === 'pickup') return 'Ready for pickup'
      if (kind === 'delivery') return 'Ready, on its way soon'
      return 'Ready'
    case 'delivered':
      if (kind === 'pickup') return 'Picked up'
      if (kind === 'delivery') return 'Delivered'
      return 'Completed'
    case 'cancelled': return 'Cancelled'
  }
}

// ── Status messages ─────────────────────────────────────────────────────────

export const MAX_ORDER_UPDATE_TEXT = 300

export const DEFAULT_UPDATE_STATUSES: readonly UpdateStatus[] = ['preparing', 'ready', 'delivered', 'cancelled']

/** The English default for a status (words live in `messages/registry.ts`). */
export function defaultUpdateText(status: UpdateStatus, kind: OrderKind): string {
  return defaultText(UPDATE_MESSAGE_IDS[status], 'en', kind)
}

const updateText = z.string().trim().max(MAX_ORDER_UPDATE_TEXT)

/** `messenger_settings.order_updates`. Validated on save and again on read. */
export const orderUpdatesSchema = z.object({
  enabled: z.boolean(),
  statuses: z.array(z.enum(UPDATE_STATUSES)).max(UPDATE_STATUSES.length),
  /** Blank / missing = the default wording above. */
  texts: z.partialRecord(z.enum(UPDATE_STATUSES), updateText),
}).strict()

export type OrderUpdatesConfig = z.infer<typeof orderUpdatesSchema>

/** No row / never saved: on, for the default statuses (owner, 2026-11-10). */
export const DEFAULT_ORDER_UPDATES: OrderUpdatesConfig = Object.freeze({
  enabled: true,
  statuses: [...DEFAULT_UPDATE_STATUSES],
  texts: {},
}) as OrderUpdatesConfig

export function readOrderUpdates(raw: unknown): OrderUpdatesConfig {
  if (raw === null || raw === undefined) return DEFAULT_ORDER_UPDATES
  const parsed = orderUpdatesSchema.safeParse(raw)
  // A row that no longer validates sends nothing rather than something the owner didn't choose.
  return parsed.success ? { ...parsed.data, statuses: [...new Set(parsed.data.statuses)] } : { enabled: false, statuses: [], texts: {} }
}

/** Meta's standard window: inside it, any message is allowed. */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

export type UpdateSkipReason =
  | 'not_platform' | 'no_psid' | 'updates_off' | 'status_not_chosen' | 'no_session' | 'outside_window' | 'bot_paused' | 'bot_off'

/**
 * Whether a status message may go out. Pure: the route reads the facts.
 *
 * Outside the 24h window nothing is sent — POST_PURCHASE_UPDATE was removed
 * by Meta and utility templates need `page_utility_messaging`, which is not
 * in the submitted App Review (D4). While staff have the bot paused for this
 * customer, the bot stays out of their conversation.
 */
export function decideOrderUpdate(input: {
  isPlatform: boolean
  hasPsid: boolean
  botEnabled: boolean
  config: OrderUpdatesConfig
  status: OrderStatus
  session: { lastInboundAt: Date | null; botPausedUntil: Date | null } | null
  now: Date
}): { send: true; status: UpdateStatus } | { send: false; reason: UpdateSkipReason } {
  if (!input.isPlatform) return { send: false, reason: 'not_platform' }
  if (!input.hasPsid) return { send: false, reason: 'no_psid' }
  if (!input.botEnabled) return { send: false, reason: 'bot_off' }
  if (!input.config.enabled) return { send: false, reason: 'updates_off' }
  const status = input.status
  if (status === 'pending' || !input.config.statuses.includes(status)) return { send: false, reason: 'status_not_chosen' }
  if (!input.session) return { send: false, reason: 'no_session' }
  const last = input.session.lastInboundAt
  if (!last || input.now.getTime() - last.getTime() > MESSAGING_WINDOW_MS) return { send: false, reason: 'outside_window' }
  const paused = input.session.botPausedUntil
  if (paused && paused.getTime() > input.now.getTime()) return { send: false, reason: 'bot_paused' }
  return { send: true, status }
}
