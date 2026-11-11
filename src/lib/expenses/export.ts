/**
 * The accountant export (plan §2.6): one row per expense in the bookkeeper's
 * columns, plus a monthly summary sheet. We hand clean data to the
 * bookkeeper; we are not the BIR book of accounts.
 *
 * - Money is pesos with two decimals ("1250.00"), from integer centavos.
 * - Gross = amount; VATable = amount − VAT and Input VAT = VAT, both blank
 *   when no VAT was recorded (a blank is "not recorded", 0.00 is "no VAT");
 *   Net paid = amount − EWT (EWT blank counts as none withheld).
 * - Void rows are exported with their status and reason — the accountant sees
 *   the correction trail. The summary counts recorded rows only, and keeps
 *   "not an expense" moves (owner took cash, deposits, loans) apart.
 * - CSV goes through the BIR sales-book helper (BOM, CRLF, formula guard).
 *
 * Web only (the export runs on the server), so it may use `@/` imports.
 */
import { toCsv, type CsvValue } from '@/lib/gov-discount-reports/csv'
import { EXPENSE_GROUPS, type DocType, type Expense, type ExpenseCategory, type ExpenseGroup, type PaidFrom, type Supplier } from './types'

export interface ExportOutlet {
  id: string
  name: string
}

export const EXPORT_COLUMNS = [
  'Date',
  'Branch',
  'Category',
  'P&L line',
  'Paid to',
  'TIN',
  'Doc type',
  'Invoice no.',
  'Gross',
  'VATable',
  'Input VAT',
  'EWT rate',
  'EWT',
  'Net paid',
  'Paid from',
  'Status',
  'Void reason',
  'Recorded by',
  'Receipt',
  'Notes',
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]
export type ExportRow = Record<ExportColumn, string>

/** The accountant's words for each group (the owner never sees these). */
export const P_AND_L_LINES: Readonly<Record<ExpenseGroup, string>> = {
  ingredients: 'Cost of sales (ingredients)',
  staff: 'Labor',
  occupancy: 'Occupancy',
  utilities: 'Utilities',
  operating: 'Operating expenses',
  admin: 'Administrative',
  other: 'Other expenses',
  capex: 'Capital expenditure (equipment)',
  not_expense: 'Not an expense (cash flow only)',
}

const PAID_FROM_LABELS: Readonly<Record<PaidFrom, string>> = {
  drawer: 'Cash drawer',
  cash: 'Cash on hand',
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank',
  card: 'Card',
  owner: "Owner's pocket",
}

const DOC_TYPE_LABELS: Readonly<Record<DocType, string>> = {
  vat_invoice: 'VAT invoice',
  non_vat_invoice: 'Non-VAT invoice',
  acknowledgement: 'Acknowledgement receipt',
  none: 'None',
}

const STORE_WIDE = 'Store-wide'

/** Centavos → "1250.00", built from integers so no float rounding creeps in. */
export function pesoText(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

function optionalPeso(cents: number | null): string {
  return cents === null ? '' : pesoText(cents)
}

function branchName(outletId: string | null, outletById: ReadonlyMap<string, ExportOutlet>): string {
  return outletId === null ? STORE_WIDE : (outletById.get(outletId)?.name ?? '')
}

interface Lookups {
  categoryById: ReadonlyMap<string, ExpenseCategory>
  supplierById: ReadonlyMap<string, Supplier>
  outletById: ReadonlyMap<string, ExportOutlet>
}

function lookups(
  categories: readonly ExpenseCategory[],
  suppliers: readonly Supplier[],
  outlets: readonly ExportOutlet[],
): Lookups {
  return {
    categoryById: new Map(categories.map((category) => [category.id, category])),
    supplierById: new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    outletById: new Map(outlets.map((outlet) => [outlet.id, outlet])),
  }
}

function toExportRow(expense: Expense, { categoryById, supplierById, outletById }: Lookups): ExportRow {
  const category = categoryById.get(expense.categoryId)
  const supplier = expense.supplierId ? supplierById.get(expense.supplierId) : undefined
  const vat = expense.vatCents
  return {
    Date: expense.spentOn,
    Branch: branchName(expense.outletId, outletById),
    Category: category?.name ?? '',
    'P&L line': category ? P_AND_L_LINES[category.group] : '',
    'Paid to': supplier?.name ?? expense.paidToName ?? '',
    TIN: expense.supplierTin ?? supplier?.tin ?? '',
    'Doc type': expense.docType ? DOC_TYPE_LABELS[expense.docType] : '',
    'Invoice no.': expense.invoiceNo ?? '',
    Gross: pesoText(expense.amountCents),
    VATable: vat === null ? '' : pesoText(expense.amountCents - vat),
    'Input VAT': optionalPeso(vat),
    'EWT rate': expense.ewtRate === null ? '' : String(expense.ewtRate),
    EWT: optionalPeso(expense.ewtCents),
    'Net paid': pesoText(expense.amountCents - (expense.ewtCents ?? 0)),
    'Paid from': PAID_FROM_LABELS[expense.paidFrom],
    Status: expense.status === 'void' ? 'Void' : 'Recorded',
    'Void reason': expense.voidReason ?? '',
    'Recorded by': expense.createdByName,
    Receipt: expense.receiptCount > 0 ? 'yes' : 'no',
    Notes: expense.note ?? '',
  }
}

function byDateThenRecorded(a: Expense, b: Expense): number {
  if (a.spentOn !== b.spentOn) return a.spentOn < b.spentOn ? -1 : 1
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/** One row per expense (void rows included), oldest first. */
export function buildExportRows(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  suppliers: readonly Supplier[],
  outlets: readonly ExportOutlet[],
): ExportRow[] {
  const maps = lookups(categories, suppliers, outlets)
  return [...expenses].sort(byDateThenRecorded).map((expense) => toExportRow(expense, maps))
}

export function exportRowsToCsv(rows: readonly ExportRow[]): string {
  return toCsv(
    EXPORT_COLUMNS,
    rows.map((row) => EXPORT_COLUMNS.map((column) => row[column])),
  )
}

export interface MonthlySummaryRow {
  /** `YYYY-MM` of the Manila business date. */
  month: string
  categoryId: string
  category: string
  group: ExpenseGroup
  plLine: string
  branchId: string | null
  branch: string
  count: number
  totalCents: number
  /** `totalCents` as "1250.00". */
  total: string
}

export interface MonthlySummary {
  expenseRows: MonthlySummaryRow[]
  notExpenseRows: MonthlySummaryRow[]
  expenseTotalCents: number
  notExpenseTotalCents: number
}

function compareSummaryRows(sortOrderOf: (categoryId: string) => number) {
  return (a: MonthlySummaryRow, b: MonthlySummaryRow): number =>
    a.month.localeCompare(b.month) ||
    EXPENSE_GROUPS.indexOf(a.group) - EXPENSE_GROUPS.indexOf(b.group) ||
    sortOrderOf(a.categoryId) - sortOrderOf(b.categoryId) ||
    a.category.localeCompare(b.category) ||
    Number(a.branchId !== null) - Number(b.branchId !== null) ||
    a.branch.localeCompare(b.branch)
}

function summaryRows(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  outlets: readonly ExportOutlet[],
): MonthlySummaryRow[] {
  const { categoryById, outletById } = lookups(categories, [], outlets)
  const rows = new Map<string, MonthlySummaryRow>()
  for (const expense of expenses) {
    if (expense.status !== 'recorded') continue
    const category = categoryById.get(expense.categoryId)
    const group: ExpenseGroup = category?.group ?? 'other'
    const month = expense.spentOn.slice(0, 7)
    const key = `${month}|${expense.categoryId}|${expense.outletId ?? ''}`
    const previous = rows.get(key)
    const totalCents = (previous?.totalCents ?? 0) + expense.amountCents
    rows.set(key, {
      month,
      categoryId: expense.categoryId,
      category: category?.name ?? '',
      group,
      plLine: P_AND_L_LINES[group],
      branchId: expense.outletId,
      branch: branchName(expense.outletId, outletById),
      count: (previous?.count ?? 0) + 1,
      totalCents,
      total: pesoText(totalCents),
    })
  }
  const sortOrderOf = (categoryId: string) => categoryById.get(categoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  return [...rows.values()].sort(compareSummaryRows(sortOrderOf))
}

const sumTotals = (rows: readonly MonthlySummaryRow[]) => rows.reduce((total, row) => total + row.totalCents, 0)

/** Recorded rows by month × category × branch; "not an expense" kept apart. */
export function buildMonthlySummary(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  outlets: readonly ExportOutlet[],
): MonthlySummary {
  const rows = summaryRows(expenses, categories, outlets)
  const expenseRows = rows.filter((row) => row.group !== 'not_expense')
  const notExpenseRows = rows.filter((row) => row.group === 'not_expense')
  return {
    expenseRows,
    notExpenseRows,
    expenseTotalCents: sumTotals(expenseRows),
    notExpenseTotalCents: sumTotals(notExpenseRows),
  }
}

export const MONTHLY_SUMMARY_COLUMNS = ['Month', 'Category', 'P&L line', 'Branch', 'Count', 'Total'] as const

function summaryLines(rows: readonly MonthlySummaryRow[], totalLabel: string): CsvValue[][] {
  const count = rows.reduce((total, row) => total + row.count, 0)
  return [
    ...rows.map((row) => [row.month, row.category, row.plLine, row.branch, row.count, row.total]),
    [totalLabel, '', '', '', count, pesoText(sumTotals(rows))],
  ]
}

/** The summary sheet: expenses, their total, a blank line, then not-an-expense moves. */
export function monthlySummaryToCsv(summary: MonthlySummary): string {
  return toCsv(MONTHLY_SUMMARY_COLUMNS, [
    ...summaryLines(summary.expenseRows, 'Total expenses'),
    [],
    ...summaryLines(summary.notExpenseRows, 'Total not an expense'),
  ])
}
