/**
 * What the "Bills to pay" tab hands its client view. Serializable only: the
 * server page reads through the caller's session (RLS decides), the view
 * groups and renders with the shared engine.
 */

import type { Bill, BillMark, BillPayment } from '@/lib/expenses/bill-schedule'
import type { Expense, ExpenseCategory, Supplier } from '@/lib/expenses/types'
import type { ExpensesOutlet } from '../expenses-page-data'

export interface BillsPageData {
  tenantId: string
  tenantSlug: string
  /** Manila, `YYYY-MM-DD`. */
  today: string
  /** The `?month=` to carry back to the Expenses tab; null = this month. */
  monthKey: string | null
  categories: ExpenseCategory[]
  suppliers: Supplier[]
  /** Active branches, for pickers. */
  outlets: ExpensesOutlet[]
  /** Every branch the store has had, for names on old bills. */
  outletNames: Record<string, string>
  isMultiBranch: boolean
  /** A branch-locked account's bills and payments are its branch's only. */
  lockedOutletId: string | null
  lockedBranchLabel: string | null
  tracksStock: boolean
  bills: Bill[]
  marks: BillMark[]
  payments: BillPayment[]
  /** Recorded expenses of the last few months: "I already recorded it" and the category picker's ranking. */
  recentExpenses: Expense[]
}
