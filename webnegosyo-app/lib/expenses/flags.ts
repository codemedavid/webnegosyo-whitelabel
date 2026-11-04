/**
 * "Needs a look" flags (plan §2.5): controls without friction. Nothing here
 * blocks a save — drawer cash has already left by the time anyone could ask —
 * it only points the owner at rows worth a second glance.
 *
 * - `no_receipt`: recorded, at or above the store's threshold (default
 *   ₱1,000; null = off) and no photo.
 * - `possible_duplicate`: another RECORDED row with the same payee + invoice
 *   number, or the same amount + category within 2 days. A row's own
 *   void-and-replace chain never counts against it.
 * - `round_other`: "Other" at a round ₱100 multiple of ₱500 or more.
 * - `after_hours_void`: voided before 06:00 or from 23:00, Manila time.
 *
 * Pure: every input is passed in. Copied byte-for-byte into the merchant app.
 */
import { daysBetween, manilaHourOf } from './manila-date'
import type { Expense, ExpenseCategory, ExpenseFlag } from './types'

export const DEFAULT_NO_RECEIPT_THRESHOLD_CENTS = 100_000
export const DUPLICATE_WINDOW_DAYS = 2
const ROUND_OTHER_STEP_CENTS = 10_000
const ROUND_OTHER_MIN_CENTS = 50_000
const BUSINESS_DAY_FIRST_HOUR = 6
const BUSINESS_DAY_END_HOUR = 23
const OTHER_SYSTEM_KEY = 'other'

export interface FlagSettings {
  categories: readonly ExpenseCategory[]
  /** Store setting; undefined = the default, null = never flag a missing receipt. */
  noReceiptThresholdCents?: number | null
}

export interface FlagContext extends FlagSettings {
  /** Rows to compare against for duplicates (may include the expense itself). */
  others: readonly Expense[]
}

function normalise(text: string | null): string {
  return (text ?? '').trim().toLowerCase().replace(/[\s\-_.#/]+/g, '')
}

/** Who was paid: the supplier record, else the typed name. '' = unknown. */
function payeeKey(expense: Expense): string {
  if (expense.supplierId) return `s:${expense.supplierId}`
  const name = normalise(expense.paidToName)
  return name ? `n:${name}` : ''
}

function invoiceKey(expense: Expense): string {
  const payee = payeeKey(expense)
  const invoice = normalise(expense.invoiceNo)
  return payee && invoice ? `${payee}|${invoice}` : ''
}

/** Connects every row to the row it replaced; one root per void-and-replace chain. */
function chainRoots(expenses: readonly Expense[]): (id: string) => string {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = id
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string
    return root
  }
  for (const expense of expenses) {
    if (!expense.replacesExpenseId) continue
    const a = find(expense.id)
    const b = find(expense.replacesExpenseId)
    if (a !== b) parent.set(a, b)
  }
  return find
}

function isDuplicatePair(expense: Expense, other: Expense): boolean {
  const invoice = invoiceKey(expense)
  if (invoice && invoice === invoiceKey(other)) return true
  return (
    expense.amountCents === other.amountCents &&
    expense.categoryId === other.categoryId &&
    Math.abs(daysBetween(expense.spentOn, other.spentOn)) <= DUPLICATE_WINDOW_DAYS
  )
}

function hasDuplicate(expense: Expense, others: readonly Expense[], chainOf: (id: string) => string): boolean {
  const chain = chainOf(expense.id)
  return others.some(
    (other) =>
      other.status === 'recorded' &&
      other.id !== expense.id &&
      chainOf(other.id) !== chain &&
      isDuplicatePair(expense, other),
  )
}

function isRoundOther(expense: Expense, category: ExpenseCategory | undefined): boolean {
  return (
    category?.systemKey === OTHER_SYSTEM_KEY &&
    expense.amountCents >= ROUND_OTHER_MIN_CENTS &&
    expense.amountCents % ROUND_OTHER_STEP_CENTS === 0
  )
}

function isAfterHoursVoid(expense: Expense): boolean {
  if (expense.status !== 'void' || !expense.voidedAt) return false
  const hour = manilaHourOf(expense.voidedAt)
  return hour < BUSINESS_DAY_FIRST_HOUR || hour >= BUSINESS_DAY_END_HOUR
}

function lacksReceipt(expense: Expense, threshold: number | null): boolean {
  return threshold !== null && expense.amountCents >= threshold && expense.receiptCount === 0
}

function flagsWith(
  expense: Expense,
  settings: FlagSettings,
  candidates: readonly Expense[],
  chainOf: (id: string) => string,
): ExpenseFlag[] {
  if (expense.status === 'void') return isAfterHoursVoid(expense) ? ['after_hours_void'] : []
  const threshold =
    settings.noReceiptThresholdCents === undefined ? DEFAULT_NO_RECEIPT_THRESHOLD_CENTS : settings.noReceiptThresholdCents
  const category = settings.categories.find((candidate) => candidate.id === expense.categoryId)
  const flags: ExpenseFlag[] = []
  if (lacksReceipt(expense, threshold)) flags.push('no_receipt')
  if (hasDuplicate(expense, candidates, chainOf)) flags.push('possible_duplicate')
  if (isRoundOther(expense, category)) flags.push('round_other')
  return flags
}

/** Flags for one expense, compared against `context.others`. */
export function computeFlags(expense: Expense, context: FlagContext): ExpenseFlag[] {
  return flagsWith(expense, context, context.others, chainRoots([expense, ...context.others]))
}

/**
 * Flags for a whole list (each row compared against the others), keyed by id.
 * Candidates are bucketed by category and by invoice so a month of rows isn't
 * compared all-against-all.
 */
export function computeFlagsForAll(expenses: readonly Expense[], settings: FlagSettings): Record<string, ExpenseFlag[]> {
  const chainOf = chainRoots(expenses)
  const buckets = new Map<string, Expense[]>()
  const addTo = (key: string, expense: Expense) => {
    const bucket = buckets.get(key)
    if (bucket) bucket.push(expense)
    else buckets.set(key, [expense])
  }
  for (const expense of expenses) {
    if (expense.status !== 'recorded') continue
    addTo(`c:${expense.categoryId}|${expense.amountCents}`, expense)
    const invoice = invoiceKey(expense)
    if (invoice) addTo(`i:${invoice}`, expense)
  }
  const candidatesOf = (expense: Expense): Expense[] => {
    const invoice = invoiceKey(expense)
    const byAmount = buckets.get(`c:${expense.categoryId}|${expense.amountCents}`) ?? []
    return invoice ? [...byAmount, ...(buckets.get(`i:${invoice}`) ?? [])] : byAmount
  }
  return Object.fromEntries(expenses.map((expense) => [expense.id, flagsWith(expense, settings, candidatesOf(expense), chainOf)]))
}

/** True when a row belongs in the "Needs a look" filter. */
export function needsALook(flags: readonly ExpenseFlag[]): boolean {
  return flags.length > 0
}
