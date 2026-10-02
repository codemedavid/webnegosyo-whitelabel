import { z } from 'zod'
import { APP_ORDER_KINDS } from './catalog'
import { isoDateTimeSchema, pesoAmountSchema } from './primitives'

/** The platform's order lifecycle, shared by all three order backends. */
export const APP_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type AppOrderStatus = (typeof APP_ORDER_STATUSES)[number]

export const APP_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'unknown'] as const

export const appOrderLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  options: z.array(z.string()),
  lineTotal: pesoAmountSchema,
})

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
