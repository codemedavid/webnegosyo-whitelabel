/**
 * Body contract for POST /api/loyverse — the merchant app's push request.
 *
 * Caller-supplied lines flow into a Supabase `.in()` lookup and then into a
 * receipt on the merchant's Loyverse account, so they are validated and
 * bounded here rather than cast.
 */

import { z } from 'zod'
import { isUuid } from '@/lib/uuid'

/** A single tender or order never comes close; this only bounds abuse. */
export const MAX_PUSH_LINES = 200

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? undefined)

const orderLineSchema = z.object({
  menu_item_id: z.string().max(100),
  menu_item_name: z.string().max(300),
  variation: optionalText(300),
  variations: z
    .record(z.string().max(300), z.string().max(300))
    .nullish()
    .transform((value) => value ?? undefined),
  addons: z.array(z.string().max(300)).max(100),
  quantity: z.number().positive().max(100_000),
  price: z.number().finite(),
  subtotal: z.number().finite(),
  special_instructions: optionalText(1000),
})

export const loyversePushBodySchema = z
  .object({
    tenantId: z.string().refine((value) => isUuid(value)),
    orderId: z.string().min(1).max(100).optional(),
    orderNumber: z.string().max(64).optional(),
    items: z.array(orderLineSchema).max(MAX_PUSH_LINES).optional(),
    context: z.enum(['order_confirm', 'pos_sale']).optional(),
  })
  .refine((body) => body.orderId !== undefined || body.items !== undefined, {
    message: 'orderId or items is required',
  })

export type LoyversePushBody = z.infer<typeof loyversePushBodySchema>
