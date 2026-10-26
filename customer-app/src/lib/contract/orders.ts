import { z } from 'zod'
import { APP_ORDER_KINDS } from './catalog'
import { isoDateTimeSchema, pesoAmountSchema } from './primitives'

/** The platform's order lifecycle, shared by all three order backends. */
export const APP_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type AppOrderStatus = (typeof APP_ORDER_STATUSES)[number]

export const APP_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'unknown'] as const

/** Picks per modifier group: groupId → optionId → count (a choice group holds 1). */
export const appSelectionsSchema = z.record(z.string().min(1), z.record(z.string().min(1), z.number().int().positive()))

export type AppSelections = z.infer<typeof appSelectionsSchema>

export const appOrderLineSchema = z.object({
  id: z.string().min(1),
  /** The dish on today's menu; null when it was removed, so "Order again" skips the line. */
  itemId: z.string().min(1).nullable(),
  /** The picks as placed, so "Order again" rebuilds the same drink. Absent on old orders. */
  selections: appSelectionsSchema.optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  options: z.array(z.string()),
  lineTotal: pesoAmountSchema,
})

export type AppOrderLine = z.infer<typeof appOrderLineSchema>

export const appOrderTotalsSchema = z.object({
  subtotal: pesoAmountSchema,
  discount: pesoAmountSchema,
  serviceCharge: pesoAmountSchema,
  deliveryFee: pesoAmountSchema,
  total: pesoAmountSchema,
})

export const appOrderSummarySchema = z.object({
  id: z.string().min(1),
  /** The store's daily number ("07"); null on backends that do not assign one. */
  number: z.string().nullable(),
  status: z.enum(APP_ORDER_STATUSES),
  placedAt: isoDateTimeSchema,
  orderKind: z.enum(APP_ORDER_KINDS),
  orderTypeName: z.string().min(1),
  outletName: z.string().nullable(),
  total: pesoAmountSchema,
  itemsPreview: z.array(z.string()).max(5),
})

export type AppOrderSummary = z.infer<typeof appOrderSummarySchema>

export const appOrderDetailSchema = z.object({
  id: z.string().min(1),
  number: z.string().nullable(),
  status: z.enum(APP_ORDER_STATUSES),
  placedAt: isoDateTimeSchema,
  orderKind: z.enum(APP_ORDER_KINDS),
  orderTypeName: z.string().min(1),
  outletName: z.string().nullable(),
  lines: z.array(appOrderLineSchema),
  totals: appOrderTotalsSchema,
  paymentStatus: z.enum(APP_PAYMENT_STATUSES),
  paymentMethodName: z.string().nullable(),
  estimatedReadyAt: isoDateTimeSchema.nullable(),
})

export type AppOrderDetail = z.infer<typeof appOrderDetailSchema>

/**
 * What the app sends to place an order. Prices are never sent: the server
 * reprices every line, and the contact is the signed-in session's phone.
 */
export const appOrderDraftSchema = z.object({
  orderTypeId: z.string().min(1),
  outletId: z.string().min(1).nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().positive().max(99),
        selections: appSelectionsSchema,
      }),
    )
    .min(1)
    .max(50),
  paymentMethodId: z.string().min(1),
  voucherCode: z.string().trim().min(1).max(40).nullable(),
  rewardId: z.string().min(1).nullable(),
  deliveryAddress: z.string().trim().min(1).max(300).nullable(),
  notes: z.string().max(300),
})

export type AppOrderDraft = z.infer<typeof appOrderDraftSchema>
