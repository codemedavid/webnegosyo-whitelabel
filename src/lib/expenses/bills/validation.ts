/**
 * Bills to pay — what a person may send (docs/plans/expenses/bills-contract.md).
 *
 * Every bill write the web actions make is parsed here first. The database
 * re-checks all of it (the shape CHECK per repeat kind, the guard and
 * integrity triggers, RLS); these schemas exist so a person gets a clear
 * sentence instead of a constraint name. The draft's business rules (name,
 * amount bounds, rule shape, start date window, reminder range, never the
 * drawer) come from the shared engine's `validateBillDraft`, so the phone and
 * the web refuse the same drafts with the same words.
 *
 * Money is integer centavos; dates are Asia/Manila business dates (YYYY-MM-DD).
 */

import { z } from 'zod'
import { BILL_AFTER_DAYS_MAX, BILL_PAID_FROM, validateBillDraft, type BillPaidFrom } from '../bill-schedule'
import { todayInManila } from '../manila-date'
import { dateWindowSchema } from '../validation'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_INPUT = 400

/** True for a real calendar date in `YYYY-MM-DD` form ('2026-02-30' is not). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

const isoDate = z.string().refine(isRealDate, 'Pick a valid date.')
const uuid = (message: string) => z.string().regex(UUID_RE, message)

const billId = uuid('That bill could not be found.')

// ---------------------------------------------------------------------------
// The repeat rule (the engine's BillRule)
// ---------------------------------------------------------------------------

const dayOfMonth = z.union([z.number().int().min(1).max(31), z.literal('last')], { message: 'Pick a day of the month.' })

export const billRuleSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('monthly'), day: dayOfMonth }).strict(),
    z.object({ kind: z.literal('twice_monthly'), days: z.tuple([dayOfMonth, dayOfMonth]) }).strict(),
    z
      .object({
        kind: z.literal('weekly'),
        every: z.union([z.literal(1), z.literal(2)]),
        weekday: z.number().int().min(0).max(6),
      })
      .strict(),
    z
      .object({
        kind: z.literal('months'),
        every: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(12)]),
        day: dayOfMonth,
      })
      .strict(),
    z.object({ kind: z.literal('after_days'), every: z.number().int().min(1).max(BILL_AFTER_DAYS_MAX) }).strict(),
  ],
  { message: 'Pick how often it repeats.' },
)

// ---------------------------------------------------------------------------
// The bill draft (create / edit)
// ---------------------------------------------------------------------------

const billPaidFrom = z.enum(BILL_PAID_FROM as unknown as [BillPaidFrom, ...BillPaidFrom[]], {
  message: 'Pick where the money comes from.',
})

/** Optional text: trimmed, blank becomes null (length is the engine's check). */
const optionalText = z
  .string()
  .max(MAX_TEXT_INPUT)
  .transform((value) => value.trim())
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()

/**
 * A bill as the owner fills it in. `outletId` null = the whole store;
 * `amountCents` null = "changes every time". The engine's `validateBillDraft`
 * runs on the parsed value (the day it is parsed is "today" in Manila).
 */
const billDraftShape = z
  .object({
    name: z.string({ message: 'Give the bill a name.' }).max(MAX_TEXT_INPUT).transform((value) => value.trim()),
    categoryId: uuid('Pick a category.'),
    outletId: uuid('That branch is not part of this store.').nullable(),
    supplierId: uuid('Choose who is paid.').nullable().optional(),
    paidToName: optionalText,
    paidFrom: billPaidFrom,
    amountCents: z.number().int('Amounts are whole centavos.').nullable(),
    rule: billRuleSchema,
    startsOn: isoDate,
    endsOn: isoDate.nullable(),
    remindDaysBefore: z.number().int('Pick how many days before.'),
  })
  .strict()

/** The engine's rules on a parsed draft. An edit keeps its own start date, however old. */
function engineCheck(isEdit: boolean) {
  return (draft: z.infer<typeof billDraftShape>, ctx: z.RefinementCtx): void => {
    const check = validateBillDraft(draft, todayInManila(new Date()), { savedStartsOn: isEdit ? draft.startsOn : null })
    if (!check.ok) ctx.addIssue({ code: 'custom', path: [check.field], message: `${check.message}.` })
  }
}

export const billDraftSchema = billDraftShape.superRefine(engineCheck(false))


/** Editing a bill: the same draft plus the bill it changes (next occurrences only). */
export const billUpdateSchema = z.object({ billId, draft: billDraftShape.superRefine(engineCheck(true)) }).strict()

export const billPauseSchema = z
  .object({
    billId,
    /** Null / absent = paused until resumed by hand. */
    pausedUntil: isoDate.nullable().optional(),
  })
  .strict()

export const billIdSchema = z.object({ billId }).strict()

// ---------------------------------------------------------------------------
// Marks: "Nothing to pay this time" / "Remind me tomorrow"
// ---------------------------------------------------------------------------

export const billMarkSchema = z
  .object({
    billId,
    dueOn: isoDate,
    kind: z.enum(['skipped', 'snoozed'], { message: 'Pick what to do with this bill.' }),
    snoozedUntil: isoDate.nullable().optional(),
  })
  .strict()
  .superRefine((mark, ctx) => {
    if (mark.kind === 'snoozed' && !mark.snoozedUntil) {
      ctx.addIssue({ code: 'custom', path: ['snoozedUntil'], message: 'Pick when to be reminded.' })
    }
    if (mark.kind === 'skipped' && mark.snoozedUntil) {
      ctx.addIssue({ code: 'custom', path: ['snoozedUntil'], message: 'A skipped bill has no reminder date.' })
    }
  })

export const billUnmarkSchema = z.object({ billId, dueOn: isoDate }).strict()

// ---------------------------------------------------------------------------
// "I already recorded it": link / unlink an existing expense
// ---------------------------------------------------------------------------

const expenseId = uuid('That expense could not be found.')

export const billLinkSchema = z.object({ expenseId, billId, dueOn: isoDate }).strict()

export const billUnlinkSchema = z.object({ expenseId }).strict()

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A due-date window for marks and payments: real dates, from ≤ to, ≤ 400 days. */
export const billWindowSchema = dateWindowSchema

export type BillRuleInput = z.output<typeof billRuleSchema>
export type BillDraftInput = z.output<typeof billDraftSchema>
export type BillUpdateInput = z.output<typeof billUpdateSchema>
export type BillPauseInput = z.output<typeof billPauseSchema>
export type BillIdInput = z.output<typeof billIdSchema>
export type BillMarkInput = z.output<typeof billMarkSchema>
export type BillUnmarkInput = z.output<typeof billUnmarkSchema>
export type BillLinkInput = z.output<typeof billLinkSchema>
export type BillUnlinkInput = z.output<typeof billUnlinkSchema>
