/**
 * Request bodies for /api/approvals/** — validated at the door. The tenant and
 * the actor are NEVER taken from here as facts: tenantId is checked against
 * the caller's own account, and the actor is the bearer token's user.
 */
import { z } from 'zod'
import { DECLINE_REASONS, NOTE_REQUIRED_REASON, REASONS_BY_KIND } from './reasons'
import type { ApprovalKind } from './types'

const MAX_PESOS = 1_000_000
const MAX_LINES = 50

const uuid = z.string().uuid()
const note = z.string().trim().max(500).optional()
/** Whole centavos only: 185.5 is fine, 185.555 is not (float-safe check). */
const isWholeCentavos = (value: number): boolean => Math.abs(Math.round(value * 100) - value * 100) < 1e-6
const pesos = z
  .number()
  .finite()
  .positive()
  .max(MAX_PESOS)
  .refine(isWholeCentavos, { message: 'Amounts are in whole centavos.' })
const pesosOrZero = z
  .number()
  .finite()
  .min(0)
  .max(MAX_PESOS)
  .refine(isWholeCentavos, { message: 'Amounts are in whole centavos.' })

const refundPayload = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('items'),
    lines: z
      .array(z.object({ orderItemId: uuid, quantity: z.number().int().positive().max(1000) }))
      .min(1)
      .max(MAX_LINES)
      .refine((lines) => new Set(lines.map((line) => line.orderItemId)).size === lines.length, {
        message: 'Each item may appear once.',
      }),
    restock: z.boolean().optional(),
  }),
  z.object({ scope: z.literal('amount'), amount: pesos, restock: z.boolean().optional() }),
  z.object({ scope: z.literal('whole'), restock: z.boolean().optional() }),
])

const base = {
  tenantId: uuid,
  reasonCode: z.string().trim().min(1).max(64),
  note,
  /** One per open request sheet: a double tap files one request. */
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
}

export const createApprovalSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('refund'), orderId: uuid, payload: refundPayload }),
    z.object({
      ...base,
      kind: z.literal('cancel_paid'),
      orderId: uuid,
      payload: z.object({ restock: z.boolean().optional() }).default({}),
    }),
    z.object({
      ...base,
      kind: z.literal('discount'),
      orderId: uuid,
      payload: z.object({
        amountOff: pesos,
        pct: z.number().finite().min(0).max(100),
        /** Senior / PWD — refused: statutory discounts are never gated. */
        statutory: z.boolean().optional(),
      }),
    }),
    z.object({
      ...base,
      kind: z.literal('stock_writeoff'),
      payload: z.object({
        inventoryItemId: uuid,
        quantity: z.number().finite().positive().max(100_000),
        outletId: uuid.nullable().optional(),
      }),
    }),
  ])
  .superRefine((body, ctx) => {
    const kind: ApprovalKind = body.kind
    if (!REASONS_BY_KIND[kind].some((reason) => reason.code === body.reasonCode)) {
      ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Pick a reason from the list.' })
    }
    if (body.reasonCode === NOTE_REQUIRED_REASON && !body.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Add a detail for "Other".' })
    }
  })

export type CreateApprovalBody = z.infer<typeof createApprovalSchema>

export const decisionSchema = z
  .object({
    tenantId: uuid,
    decision: z.enum(['approve', 'decline']),
    reasonCode: z.string().trim().max(64).optional(),
    note,
    /** Approve less than asked (amount refunds only; ≤ requested). */
    amountOverride: pesos.optional(),
    /** Where the tap came from (push approve uses a 4 s undo first). */
    source: z.enum(['app', 'push', 'web']).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision === 'decline') {
      if (!body.reasonCode || !DECLINE_REASONS.some((reason) => reason.code === body.reasonCode)) {
        ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Pick a reason so they know what to do next.' })
      }
      if (body.amountOverride !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['amountOverride'], message: 'Only an approval can change the amount.' })
      }
    }
    if (body.reasonCode === NOTE_REQUIRED_REASON && body.decision === 'decline' && !body.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Add a detail for "Other".' })
    }
  })

export type DecisionBody = z.infer<typeof decisionSchema>

export const tenantOnlySchema = z.object({ tenantId: uuid })

export const listQuerySchema = z.object({
  tenantId: uuid,
  status: z.enum(['pending', 'mine', 'recent']).default('pending'),
})

export const rulesUpdateSchema = z
  .object({
    tenantId: uuid,
    directRefundCap: pesosOrZero.optional(),
    managerApproveCap: pesosOrZero.optional(),
    staffRefundWindow: z.enum(['same_day', 'any']).optional(),
    discountPctNeedsApproval: z.number().finite().min(0).max(100).optional(),
    writeoffCostNeedsApproval: pesosOrZero.optional(),
    expiryMinutes: z.number().int().min(5).max(240).optional(),
    maxPendingPerStaff: z.number().int().min(1).max(20).optional(),
  })
  .strict()

export type RulesUpdateBody = z.infer<typeof rulesUpdateSchema>

/** The first human-readable issue, for the `{ error }` envelope. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.'
}
