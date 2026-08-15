/**
 * New-order push notifications for the platform Supabase order backend.
 *
 * Pure core mirroring the tested Convex rules in
 * `convex-template/convex/pushRecipients.ts` and `notifications.ts`, so a
 * tenant moved from Convex to the platform hears exactly the same alerts.
 * Every rule fails toward noise rather than silence: an extra buzz is an
 * annoyance; a notification that reaches nobody loses the order.
 */
import { z } from 'zod'

/** A registered device, as far as the recipient rule is concerned. */
export interface PushTokenRow {
  token: string
  /**
   * The branch this device is bound to. Null means store-wide: an owner's
   * device, or one registered before branch-aware registration. Both must
   * keep hearing everything.
   */
  outlet_id: string | null
}

/** The slice of an order row that decides who gets rung and what they read. */
export interface PushableOrder {
  id: string
  customerName: string
  total: number
  itemCount: number
}

export interface ExpoPushMessage {
  to: string
  sound: 'default'
  /**
   * Routes Android notifications to the high-importance "orders" channel so
   * they ring with the custom ringtone; the default channel never plays it.
   * Ignored on iOS.
   */
  channelId: 'orders'
  title: string
  body: string
  data: { orderId: string }
}

/** The Expo push API accepts at most this many messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100

const notifyOrderPayloadSchema = z.object({
  order_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
})

export type NotifyOrderPayload = z.infer<typeof notifyOrderPayloadSchema>

/** The trigger payload, or null when the caller sent something else. */
export function parseNotifyOrderPayload(body: unknown): NotifyOrderPayload | null {
  const parsed = notifyOrderPayloadSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

function normalizeOutletId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The branch an order belongs to: the column when set, else the branch the
 * storefront/register stamped into `customer_data`. Orders written before the
 * column existed carry the branch only in the blob, so the fallback is
 * load-bearing, not defensive padding.
 */
export function resolveOrderOutletId(order: {
  outlet_id?: string | null
  customer_data?: unknown
}): string | null {
  const fromColumn = normalizeOutletId(order.outlet_id)
  if (fromColumn !== null) return fromColumn

  if (typeof order.customer_data !== 'object' || order.customer_data === null) {
    return null
  }
  return normalizeOutletId((order.customer_data as Record<string, unknown>).outlet_id)
}

/**
 * The devices to ring for an order from `orderOutletId`. Two openings, both
 * intentional (same as Convex `recipientsForOutlet`):
 * - a device with no branch hears every branch (owners, older builds)
 * - an order with no branch rings every device (single-location stores)
 */
export function selectPushRecipients<T extends PushTokenRow>(
  tokens: readonly T[],
  orderOutletId: string | null | undefined
): T[] {
  const orderOutlet = normalizeOutletId(orderOutletId)
  if (orderOutlet === null) return [...tokens]

  return tokens.filter((row) => {
    const deviceOutlet = normalizeOutletId(row.outlet_id)
    return deviceOutlet === null || deviceOutlet === orderOutlet
  })
}

/** One Expo message per recipient, byte-identical to the Convex payload. */
export function buildExpoPushMessages(
  tokens: readonly PushTokenRow[],
  order: PushableOrder
): ExpoPushMessage[] {
  const itemNoun = order.itemCount === 1 ? 'item' : 'items'
  const body = `${order.customerName} — ₱${order.total.toFixed(2)} (${order.itemCount} ${itemNoun})`

  return tokens.map((row) => ({
    to: row.token,
    sound: 'default',
    channelId: 'orders',
    title: 'New Order!',
    body,
    data: { orderId: order.id },
  }))
}

/** Batches sized for the Expo push API. */
export function chunkExpoPushMessages<T>(messages: readonly T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE))
  }
  return chunks
}
