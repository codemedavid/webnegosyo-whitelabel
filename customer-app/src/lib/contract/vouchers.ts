import { z } from 'zod'
import { appOrderDraftSchema } from './orders'
import { pesoAmountSchema } from './primitives'

/**
 * `POST /vouchers/preview` — what a code would take off THIS bag. The server
 * prices the lines itself (category scope, unit limits, caps, minimum spend),
 * so the app shows the answer instead of estimating it. The order re-prices
 * the code again when it is placed; this is the number the customer decides on.
 */
export const appVoucherPreviewRequestSchema = z.object({
  code: z.string().trim().min(1).max(40),
  orderTypeId: appOrderDraftSchema.shape.orderTypeId,
  outletId: appOrderDraftSchema.shape.outletId,
  lines: appOrderDraftSchema.shape.lines,
})

export type AppVoucherPreviewRequest = z.infer<typeof appVoucherPreviewRequestSchema>

export const appVoucherPreviewSchema = z.object({
  /** The code as the store spells it. */
  code: z.string().min(1),
  /** The voucher's name for the bag row ("10% off drinks"). */
  label: z.string().min(1),
  /** Whether it takes anything off this bag right now. */
  isApplied: z.boolean(),
  /** Pesos off this bag; 0 when not applied. */
  discount: pesoAmountSchema,
  /** Why it does not apply yet, written for the customer ("Add ₱120 more…"); null when applied. */
  reason: z.string().min(1).nullable(),
})

export type AppVoucherPreview = z.infer<typeof appVoucherPreviewSchema>
