/**
 * Expenses — what a person may send (contract: docs/plans/expenses/contract.md).
 *
 * Every write the web actions, the receipt routes and the merchant app make is
 * parsed here first. The database re-checks all of it (CHECK constraints, the
 * guard and link triggers, the RPCs); these schemas exist so a person gets a
 * clear sentence instead of a constraint name, and so a malformed request never
 * reaches the database at all.
 *
 * Money is integer centavos; dates are Asia/Manila business dates (YYYY-MM-DD).
 */

import { z } from 'zod'
import { daysBetween, todayInManila } from './manila-date'
import { DOC_TYPES, EXPENSE_GROUPS, PAID_FROM, SUPPLIER_KINDS } from './types'

export const MAX_AMOUNT_CENTS = 1_000_000_000
export const MAX_NOTE_LENGTH = 200
export const MAX_REASON_LENGTH = 200
export const MAX_PAID_TO_LENGTH = 80
export const MAX_CREATED_BY_NAME_LENGTH = 80
export const MAX_INVOICE_NO_LENGTH = 40
export const MAX_CATEGORY_NAME_LENGTH = 60
export const MAX_CATEGORY_ICON_LENGTH = 8
export const MAX_SUPPLIER_NAME_LENGTH = 80
export const MAX_SUPPLIER_PHONE_LENGTH = 30
export const MAX_SUPPLIER_NOTE_LENGTH = 200
/** How far back an expense may be dated, and how long a read window may be. */
export const MAX_DAYS_BACK = 400
/** A phone whose clock runs ahead of Manila midnight must not be refused. */
export const FUTURE_TOLERANCE_DAYS = 1

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 9-digit TIN, optionally followed by a 3–5 digit branch code. */
const TIN_RE = /^\d{9}(\d{3,5})?$/

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** True for a real calendar date in `YYYY-MM-DD` form ('2026-02-30' is not). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

/** Days from `from` to `to`; null when either is not a real date. */
function spanInDays(from: string, to: string): number | null {
  return isRealDate(from) && isRealDate(to) ? daysBetween(from, to) : null
}

/** The sentence to show for a spent-on date, or null when it is acceptable. */
export function spentOnProblem(spentOn: string, nowMs: number): string | null {
  if (!isRealDate(spentOn)) return 'Pick a valid date.'
  const offset = daysBetween(todayInManila(new Date(nowMs)), spentOn)
  if (offset > FUTURE_TOLERANCE_DAYS) return "An expense can't be dated in the future."
  if (offset < -MAX_DAYS_BACK) return `An expense can't be dated more than ${MAX_DAYS_BACK} days back.`
  return null
}

const isoDate = z.string().refine(isRealDate, 'Pick a valid date.')

const spentOn = z.string().superRefine((value, ctx) => {
  const problem = spentOnProblem(value, Date.now())
  if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

// ---------------------------------------------------------------------------
// Field building blocks
// ---------------------------------------------------------------------------

const uuid = (message: string) => z.string().regex(UUID_RE, message)

const amountCents = z
  .number({ message: 'Enter an amount.' })
  .int('Amounts are whole centavos.')
  .min(1, 'Enter an amount above zero.')
  .max(MAX_AMOUNT_CENTS, 'That amount is too large.')

/** Optional text: trimmed, blank becomes null. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max * 4) // bound the raw input before trimming
    .transform((value) => value.trim())
    .refine((value) => value.length <= max, `${label} can be at most ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
}

/** Required text: trimmed, 1..max characters. */
function requiredText(max: number, emptyMessage: string, label: string) {
  return z
    .string({ message: emptyMessage })
    .max(max * 4)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, emptyMessage)
    .refine((value) => value.length <= max, `${label} can be at most ${max} characters.`)
}

/** Strips spaces and dashes the way people type a TIN ("123-456-789-000"). */
export function normalizeTin(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

const tin = z
  .string()
  .max(64)
  .transform(normalizeTin)
  .refine((value) => value.length === 0 || TIN_RE.test(value), 'A TIN is 9 digits, plus a 3–5 digit branch code if it has one.')
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()

const optionalCents = z
  .number()
  .int('Amounts are whole centavos.')
  .min(0, "This amount can't be negative.")
  .max(MAX_AMOUNT_CENTS, 'That amount is too large.')
  .nullable()
  .optional()

const ewtRate = z.number().min(0, 'A rate is between 0 and 100.').max(100, 'A rate is between 0 and 100.').nullable().optional()

const nonDrawerPaidFrom = z.enum(
  PAID_FROM.filter((value) => value !== 'drawer') as [Exclude<(typeof PAID_FROM)[number], 'drawer'>, ...Exclude<(typeof PAID_FROM)[number], 'drawer'>[]],
  { message: 'Choose how this was paid.' },
)

const taxFields = {
  docType: z.enum(DOC_TYPES).nullable().optional(),
  invoiceNo: optionalText(MAX_INVOICE_NO_LENGTH, 'The invoice number'),
  supplierTin: tin,
  vatCents: optionalCents,
  ewtCents: optionalCents,
  ewtRate,
  form2307Given: z.boolean().optional(),
}

interface TaxAmounts {
  amountCents?: number
  vatCents?: number | null
  ewtCents?: number | null
}

/** VAT and withholding are parts OF the amount, never equal to or above it. */
function checkTaxBelowAmount(value: TaxAmounts, ctx: z.RefinementCtx): void {
  if (value.amountCents === undefined) return
  if (value.vatCents != null && value.vatCents >= value.amountCents) {
    ctx.addIssue({ code: 'custom', path: ['vatCents'], message: 'VAT must be less than the amount.' })
  }
  if (value.ewtCents != null && value.ewtCents >= value.amountCents) {
    ctx.addIssue({ code: 'custom', path: ['ewtCents'], message: 'Withholding tax must be less than the amount.' })
  }
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** A NON-drawer expense (`ExpenseDraft`). */
export const expenseDraftSchema = z
  .object({
    amountCents,
    categoryId: uuid('Choose a category.'),
    spentOn,
    paidFrom: nonDrawerPaidFrom,
    outletId: uuid('That branch is not part of this store.').nullable(),
    note: optionalText(MAX_NOTE_LENGTH, 'The note'),
    supplierId: uuid('Choose who was paid.').nullable().optional(),
    paidToName: optionalText(MAX_PAID_TO_LENGTH, 'Paid to'),
    isStockPurchase: z.boolean().optional(),
    clientRequestId: uuid('This request is missing its id. Reload and try again.'),
    ...taxFields,
  })
  .strict()
  .superRefine(checkTaxBelowAmount)

/** A cashier paying an expense out of their open drawer (`DrawerExpenseDraft`). */
export const drawerExpenseDraftSchema = z
  .object({
    shiftId: uuid('Open a drawer first.'),
    amountCents,
    categoryId: uuid('Choose a category.'),
    note: optionalText(MAX_NOTE_LENGTH, 'The note'),
    supplierId: uuid('Choose who was paid.').nullable().optional(),
    paidToName: optionalText(MAX_PAID_TO_LENGTH, 'Paid to'),
    clientRequestId: uuid('This request is missing its id. Reload and try again.'),
  })
  .strict()

const expenseId = uuid('That expense could not be found.')
const reason = requiredText(MAX_REASON_LENGTH, 'Say why.', 'The reason')

export const voidExpenseSchema = z.object({ expenseId, reason }).strict()

/**
 * The fields `replace_expense` may change. A drawer row refuses amount, paid
 * from, branch and date in the database (`drawer_locked`); nothing may become
 * a drawer expense this way, because a drawer expense needs a pay-out.
 */
export const replacePatchSchema = z
  .object({
    categoryId: uuid('Choose a category.').optional(),
    amountCents: amountCents.optional(),
    spentOn: spentOn.optional(),
    paidFrom: nonDrawerPaidFrom.optional(),
    outletId: uuid('That branch is not part of this store.').nullable().optional(),
    note: optionalText(MAX_NOTE_LENGTH, 'The note'),
    supplierId: uuid('Choose who was paid.').nullable().optional(),
    paidToName: optionalText(MAX_PAID_TO_LENGTH, 'Paid to'),
    isStockPurchase: z.boolean().optional(),
    ...taxFields,
  })
  .strict()
  .superRefine(checkTaxBelowAmount)
  .refine((patch) => Object.keys(patch).length > 0, 'Change at least one thing.')

export const replaceExpenseSchema = z.object({ expenseId, reason, patch: replacePatchSchema }).strict()

/** Fields anyone with `expenses` may fix in place; everything else is a replace. */
export const expenseDetailsUpdateSchema = z
  .object({
    expenseId,
    note: optionalText(MAX_NOTE_LENGTH, 'The note'),
    supplierId: uuid('Choose who was paid.').nullable().optional(),
    paidToName: optionalText(MAX_PAID_TO_LENGTH, 'Paid to'),
    isStockPurchase: z.boolean().optional(),
    ...taxFields,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expenseId'), 'Change at least one thing.')

/** Linking an existing pay-out (recorded without a category) to an expense. */
export const sortDrawerPayoutSchema = z
  .object({
    movementId: uuid('That pay-out could not be found.'),
    categoryId: uuid('Choose a category.'),
    note: optionalText(MAX_NOTE_LENGTH, 'The note'),
    supplierId: uuid('Choose who was paid.').nullable().optional(),
    paidToName: optionalText(MAX_PAID_TO_LENGTH, 'Paid to'),
  })
  .strict()

// ---------------------------------------------------------------------------
// Categories and suppliers
// ---------------------------------------------------------------------------

export const categorySaveSchema = z
  .object({
    id: uuid('That category could not be found.').optional(),
    name: requiredText(MAX_CATEGORY_NAME_LENGTH, 'Name the category.', 'A category name'),
    group: z.enum(EXPENSE_GROUPS, { message: 'Choose what kind of cost this is.' }),
    icon: optionalText(MAX_CATEGORY_ICON_LENGTH, 'The badge'),
    needsNote: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()

export const archiveCategorySchema = z
  .object({ id: uuid('That category could not be found.'), archived: z.boolean().optional() })
  .strict()

export const supplierSaveSchema = z
  .object({
    id: uuid('That supplier could not be found.').optional(),
    name: requiredText(MAX_SUPPLIER_NAME_LENGTH, 'Enter who was paid.', 'A name'),
    kind: z.enum(SUPPLIER_KINDS).optional(),
    tin,
    defaultCategoryId: uuid('Choose a category.').nullable().optional(),
    phone: optionalText(MAX_SUPPLIER_PHONE_LENGTH, 'The phone number'),
    note: optionalText(MAX_SUPPLIER_NOTE_LENGTH, 'The note'),
    archived: z.boolean().optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** `from` ≤ `to`, at most MAX_DAYS_BACK days apart. */
function checkWindow(value: { from: string; to: string }, ctx: z.RefinementCtx): void {
  const span = spanInDays(value.from, value.to)
  if (span === null) return
  if (span < 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date is before the start date.' })
  else if (span > MAX_DAYS_BACK) ctx.addIssue({ code: 'custom', path: ['to'], message: `Pick at most ${MAX_DAYS_BACK} days.` })
}

/** A read window: real dates, `from` ≤ `to`, at most MAX_DAYS_BACK days long. */
export const dateWindowSchema = z
  .object({ from: isoDate, to: isoDate })
  .superRefine(checkWindow)

export const expenseListFilterSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    outletId: uuid('That branch is not part of this store.').nullable().optional(),
    categoryId: uuid('Choose a category.').optional(),
    paidFrom: z.enum(PAID_FROM).optional(),
    status: z.enum(['recorded', 'void', 'all']).optional(),
    search: z.string().max(80).optional(),
  })
  .superRefine(checkWindow)

export type ExpenseDraftInput = z.output<typeof expenseDraftSchema>
export type DrawerExpenseDraftInput = z.output<typeof drawerExpenseDraftSchema>
export type VoidExpenseInput = z.output<typeof voidExpenseSchema>
export type ReplacePatchInput = z.output<typeof replacePatchSchema>
export type ReplaceExpenseInput = z.output<typeof replaceExpenseSchema>
export type ExpenseDetailsUpdateInput = z.output<typeof expenseDetailsUpdateSchema>
export type SortDrawerPayoutInput = z.output<typeof sortDrawerPayoutSchema>
export type CategorySaveInput = z.output<typeof categorySaveSchema>
export type ArchiveCategoryInput = z.output<typeof archiveCategorySchema>
export type SupplierSaveInput = z.output<typeof supplierSaveSchema>
export type DateWindowInput = z.output<typeof dateWindowSchema>
export type ExpenseListFilterInput = z.output<typeof expenseListFilterSchema>

/** The first issue's message, for an action result. */
export function firstIssueMessage(error: z.ZodError, fallback = 'Check the details and try again.'): string {
  return error.issues[0]?.message ?? fallback
}
