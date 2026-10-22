/**
 * What the expenses page hands its client workspace. Serializable only: the
 * server page reads, the workspace filters and renders.
 */

import type { Expense, ExpenseCategory, Supplier, UnsortedPayout } from '@/lib/expenses/types'
import type { MonthRange } from './expense-format'

export interface ExpensesOutlet {
  id: string
  name: string
}

export interface ExpensesPageData {
  tenantId: string
  tenantSlug: string
  month: MonthRange
  /** Previous / next month keys for the picker; next is null for the current month. */
  previousMonthKey: string
  nextMonthKey: string | null
  /** Manila, `YYYY-MM-DD`. */
  today: string
  categories: ExpenseCategory[]
  suppliers: Supplier[]
  /** Active branches, for pickers. */
  outlets: ExpensesOutlet[]
  /** Every branch the store has had, inactive included, for names on old rows. */
  outletNames: Record<string, string>
  isMultiBranch: boolean
  /** A branch-locked account reads and records its own branch only. */
  lockedOutletId: string | null
  lockedBranchLabel: string | null
  /** The month's expenses, voided rows included (shown struck through). */
  expenses: Expense[]
  /** Bill id → name, for expenses that pay a bill (the "Bill" badge). Absent = none read. */
  billNames?: Record<string, string>
  /** True when the month held more rows than one read returns. */
  isTruncated: boolean
  unsortedPayouts: UnsortedPayout[]
  /** The store counts stock: ask "Did this go into your stock count?" on Ingredients. */
  tracksStock: boolean
  /** Can file old pay-outs (store-wide accounts with `expenses`). */
  canSortPayouts: boolean
  /** Deep-link state from the URL (e.g. Profit's trust strip); see `readInitialLink`. */
  initial: ExpensesInitialLink
}

export interface ExpensesInitialLink {
  /** `?add=1` → '' (open, no category); `?add=<categoryId>` → that id; absent → null. */
  add: string | null
  view: string | null
  categoryId: string | null
  /** `?on=YYYY-MM-DD`: the date a new entry starts on (Profit's "Record" for a past period). */
  spentOn: string | null
}
