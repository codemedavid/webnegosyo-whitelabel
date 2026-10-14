/**
 * Why an order moved — the optional reason (and free note) a cancel carries.
 *
 * Validated once here and reused by every writer: the web's status action,
 * the lifecycle route the app and the Convex admin post to. Optional for now;
 * Phase 2 of Store Activity makes the cancel UI require a reason. Limits match
 * the database CHECKs on order_status_events / orders.cancel_reason.
 */

import { z } from 'zod'

export const ORDER_EVENT_REASON_MAX = 500
export const ORDER_EVENT_NOTE_MAX = 1000

function optionalText(max: number) {
  return z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? ''
      return trimmed === '' ? null : trimmed
    })
}

export const orderEventReasonSchema = z.object({
  reason: optionalText(ORDER_EVENT_REASON_MAX),
  note: optionalText(ORDER_EVENT_NOTE_MAX),
})

export interface OrderEventReason {
  reason: string | null
  note: string | null
}

export type OrderEventReasonParse = { ok: true; value: OrderEventReason } | { ok: false; error: string }

export function parseOrderEventReason(input: { reason?: unknown; note?: unknown }): OrderEventReasonParse {
  const parsed = orderEventReasonSchema.safeParse({ reason: input.reason, note: input.note })
  if (parsed.success) return { ok: true, value: parsed.data }
  const issue = parsed.error.issues[0]
  const field = issue?.path.join('.') || 'reason'
  return { ok: false, error: `${field} must be text of at most ${field === 'note' ? ORDER_EVENT_NOTE_MAX : ORDER_EVENT_REASON_MAX} characters.` }
}
