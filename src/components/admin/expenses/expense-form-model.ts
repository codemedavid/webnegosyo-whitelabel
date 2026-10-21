/**
 * The add / fix expense form as data: its state, what it refuses, and what it
 * sends (plan §5.4; contract §5, §8).
 *
 * Pure. Amounts are typed as text ("1,250", "₱80.50") and parsed with the
 * keypad engine's `parsePesoInput`, so the web and the app read a typed amount
 * the same way. The database re-checks everything; these checks exist so the
 * owner gets a sentence next to the field, before anything is sent.
 */

import { parsePesoInput } from '@/lib/expenses/keypad'
import type { DocType, Expense, ExpenseCategory, ExpenseDraft, PaidFrom, TaxDetails } from '@/lib/expenses/types'
import { MAX_NOTE_LENGTH, MAX_REASON_LENGTH, normalizeTin, spentOnProblem } from '@/lib/expenses/validation'

export type WebPaidFrom = Exclude<PaidFrom, 'drawer'>

export interface ExpenseFormState {
  amountText: string
  categoryId: string | null
  spentOn: string
  paidFrom: WebPaidFrom
  /** null = whole store. */
  outletId: string | null
  supplierId: string | null
  paidToName: string
  note: string
  /** Only asked for Ingredients in a store that tracks stock; null = not answered. */
  isStockPurchase: boolean | null
  docType: DocType | null
  invoiceNo: string
  supplierTin: string
  vatText: string
  ewtRateText: string
  ewtText: string
  form2307Given: boolean
  /** Fix mode only: why the original is being replaced. */
  reason: string
}

export type FormField = 'amount' | 'category' | 'spentOn' | 'note' | 'reason' | 'supplierTin' | 'vat' | 'ewt' | 'ewtRate'
export type FormErrors = Partial<Record<FormField, string>>

export interface BlankFormDefaults {
  today: string
  paidFrom?: WebPaidFrom
  outletId?: string | null
}

export function blankForm({ today, paidFrom = 'cash', outletId = null }: BlankFormDefaults): ExpenseFormState {
  return {
    amountText: '',
    categoryId: null,
    spentOn: today,
    paidFrom,
    outletId,
    supplierId: null,
    paidToName: '',
    note: '',
    isStockPurchase: null,
    docType: null,
    invoiceNo: '',
    supplierTin: '',
    vatText: '',
    ewtRateText: '',
    ewtText: '',
    form2307Given: false,
    reason: '',
  }
}

function centsText(cents: number | null): string {
  if (cents === null) return ''
  const pesos = cents / 100
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2)
}

/** The form opened on an existing expense (Fix). Drawer rows keep their source. */
export function formFromExpense(expense: Expense): ExpenseFormState {
  return {
    amountText: centsText(expense.amountCents),
    categoryId: expense.categoryId,
    spentOn: expense.spentOn,
    paidFrom: expense.paidFrom === 'drawer' ? 'cash' : expense.paidFrom,
    outletId: expense.outletId,
    supplierId: expense.supplierId,
    paidToName: expense.paidToName ?? '',
    note: expense.note ?? '',
    isStockPurchase: expense.isStockPurchase,
    docType: expense.docType,
    invoiceNo: expense.invoiceNo ?? '',
    supplierTin: expense.supplierTin ?? '',
    vatText: centsText(expense.vatCents),
    ewtRateText: expense.ewtRate === null ? '' : String(expense.ewtRate),
    ewtText: centsText(expense.ewtCents),
    form2307Given: expense.form2307Given,
    reason: '',
  }
}

/** Optional money: blank is null, unreadable is NaN (an error). */
function optionalCents(text: string): number | null {
  if (text.trim() === '') return null
  const cents = parsePesoInput(text)
  return cents === null ? Number.NaN : cents
}

function optionalRate(text: string): number | null {
  const trimmed = text.replace(/%/g, '').trim()
  if (trimmed === '') return null
  const rate = Number(trimmed)
  return Number.isFinite(rate) ? rate : Number.NaN
}

const TIN_PATTERN = /^\d{9}(\d{3,5})?$/

/** 12/112 of a VAT-inclusive amount, in centavos (plan §2.6). */
export function vatFromGross(amountCents: number): number {
  return Math.round((amountCents * 12) / 112)
}

/** Withholding = rate × the amount before VAT, in centavos. */
export function ewtFromRate(amountCents: number, vatCents: number | null, ratePercent: number): number {
  return Math.round(((amountCents - (vatCents ?? 0)) * ratePercent) / 100)
}

export interface ValidateContext {
  categoriesById: ReadonlyMap<string, ExpenseCategory>
  nowMs: number
  mode: 'add' | 'fix'
}

export interface ValidatedForm {
  errors: FormErrors
  amountCents: number | null
}

export function validateForm(state: ExpenseFormState, context: ValidateContext): ValidatedForm {
  const errors: FormErrors = {}
  const amountCents = state.amountText.trim() === '' ? null : parsePesoInput(state.amountText)

  if (amountCents === null) {
    errors.amount = state.amountText.trim() === '' ? 'Enter how much was paid.' : 'Type the amount as a number, like 1,250 or 80.50.'
  } else if (amountCents <= 0) {
    errors.amount = 'Enter an amount above zero.'
  }

  const category = state.categoryId ? context.categoriesById.get(state.categoryId) : undefined
  if (!category) errors.category = 'Choose what this was for.'
  if (category?.needsNote && state.note.trim() === '') {
    errors.note = `Add a short note for “${category.name}” so you remember what it was.`
  }
  if (state.note.trim().length > MAX_NOTE_LENGTH) errors.note = `Keep the note under ${MAX_NOTE_LENGTH} characters.`

  const dateProblem = spentOnProblem(state.spentOn, context.nowMs)
  if (dateProblem) errors.spentOn = dateProblem

  const tin = normalizeTin(state.supplierTin)
  if (tin !== '' && !TIN_PATTERN.test(tin)) errors.supplierTin = 'A TIN is 9 digits, plus a 3–5 digit branch code if it has one.'

  const vat = optionalCents(state.vatText)
  if (Number.isNaN(vat)) errors.vat = 'Type VAT as a number.'
  else if (vat !== null && amountCents !== null && vat >= amountCents) errors.vat = 'VAT must be less than the amount.'

  const ewt = optionalCents(state.ewtText)
  if (Number.isNaN(ewt)) errors.ewt = 'Type the amount withheld as a number.'
  else if (ewt !== null && amountCents !== null && ewt >= amountCents) errors.ewt = 'Withholding must be less than the amount.'

  const rate = optionalRate(state.ewtRateText)
  if (Number.isNaN(rate) || (rate !== null && (rate < 0 || rate > 100))) errors.ewtRate = 'A rate is between 0 and 100.'

  if (context.mode === 'fix') {
    const reason = state.reason.trim()
    if (reason === '') errors.reason = 'Say why you are fixing it. It goes in the history.'
    else if (reason.length > MAX_REASON_LENGTH) errors.reason = `Keep the reason under ${MAX_REASON_LENGTH} characters.`
  }

  return { errors, amountCents: amountCents !== null && amountCents > 0 ? amountCents : null }
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** The first field to send focus to, in the order the form reads. */
export const FIELD_ORDER: readonly FormField[] = ['amount', 'category', 'spentOn', 'note', 'reason', 'supplierTin', 'vat', 'ewtRate', 'ewt']

function blankToNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

function taxDetails(state: ExpenseFormState): TaxDetails {
  const vat = optionalCents(state.vatText)
  const ewt = optionalCents(state.ewtText)
  const rate = optionalRate(state.ewtRateText)
  const tin = normalizeTin(state.supplierTin)
  return {
    docType: state.docType,
    invoiceNo: blankToNull(state.invoiceNo),
    supplierTin: tin === '' ? null : tin,
    vatCents: Number.isNaN(vat) ? null : vat,
    ewtCents: Number.isNaN(ewt) ? null : ewt,
    ewtRate: Number.isNaN(rate) ? null : rate,
    form2307Given: state.form2307Given,
  }
}

/** What a new expense sends. Call only after `validateForm` passed. */
export function buildDraft(state: ExpenseFormState, amountCents: number, clientRequestId: string): ExpenseDraft {
  return {
    amountCents,
    categoryId: state.categoryId as string,
    spentOn: state.spentOn,
    paidFrom: state.paidFrom,
    outletId: state.outletId,
    note: blankToNull(state.note),
    supplierId: state.supplierId,
    paidToName: state.supplierId ? null : blankToNull(state.paidToName),
    isStockPurchase: state.isStockPurchase === true,
    clientRequestId,
    ...taxDetails(state),
  }
}

export type ExpensePatch = Partial<Omit<ExpenseDraft, 'clientRequestId'>>

/**
 * Only what changed, for `replace_expense`. A drawer row never sends amount,
 * date, source or branch: the cash really left that drawer (`drawer_locked`).
 */
export function buildPatch(original: Expense, state: ExpenseFormState, amountCents: number): ExpensePatch {
  const next = buildDraft(state, amountCents, '')
  const isDrawer = original.paidFrom === 'drawer'
  const candidate: ExpensePatch = {
    categoryId: next.categoryId,
    note: next.note,
    supplierId: next.supplierId,
    paidToName: next.paidToName,
    isStockPurchase: next.isStockPurchase,
    docType: next.docType,
    invoiceNo: next.invoiceNo,
    supplierTin: next.supplierTin,
    vatCents: next.vatCents,
    ewtCents: next.ewtCents,
    ewtRate: next.ewtRate,
    form2307Given: next.form2307Given,
    ...(isDrawer ? {} : { amountCents: next.amountCents, spentOn: next.spentOn, paidFrom: next.paidFrom, outletId: next.outletId }),
  }
  const before: Record<string, unknown> = {
    categoryId: original.categoryId,
    note: original.note,
    supplierId: original.supplierId,
    paidToName: original.paidToName,
    isStockPurchase: original.isStockPurchase,
    docType: original.docType,
    invoiceNo: original.invoiceNo,
    supplierTin: original.supplierTin,
    vatCents: original.vatCents,
    ewtCents: original.ewtCents,
    ewtRate: original.ewtRate,
    form2307Given: original.form2307Given,
    amountCents: original.amountCents,
    spentOn: original.spentOn,
    paidFrom: original.paidFrom,
    outletId: original.outletId,
  }
  return Object.fromEntries(
    Object.entries(candidate).filter(([key, value]) => (before[key] ?? null) !== (value ?? null)),
  ) as ExpensePatch
}
