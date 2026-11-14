/**
 * Matching the owner's own headings to the catalogue ("Benta" → Sales,
 * "Petsa" → Day), for a report in their format (`report-format.ts`).
 *
 * This is a FIRST GUESS, by the words alone: same heading, same id, or a
 * word the trade uses for it (English and Filipino). Owl reads the guess
 * beside the owner's sample rows and corrects it; the owner sees the final
 * matching on the card before anything is saved. A heading nothing matches
 * stays blank, which is always safe: a wrong match is a wrong figure.
 *
 * Pure and browser-safe.
 */

import { EXPORT_SHEETS, type SheetId } from './catalogue'
import { MAX_FORMAT_HEADER } from './report-format'
import type { ExportColumn } from './types'

export function foldWords(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The owner's heading as a heading we can write: no leading `=`, `+`, `-`,
 * `@` (a formula in someone's spreadsheet), one line, cut to fit. An empty
 * cell in their heading row becomes "Column N".
 */
export function cleanHeading(raw: string, index: number): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .slice(0, MAX_FORMAT_HEADER)
    .trim()
  return cleaned || `Column ${index + 1}`
}

/** A tab name Excel accepts, from the owner's own. */
export function cleanTabTitle(raw: string, index: number): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f\\/?*[\]:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim()
    .slice(0, 31)
    .trim()
  return cleaned || `Sheet ${index + 1}`
}

/**
 * Words the trade uses, each with the column ids it may mean, best first.
 * The first id the sheet actually has wins, so "total" is the order total on
 * the Orders sheet and Sales on Sales by day.
 */
const WORDS: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  [['date', 'petsa', 'araw', 'day', 'business day', 'business date'], ['day', 'business_day', 'date']],
  [['weekday', 'day of week'], ['weekday']],
  [['time', 'oras'], ['time']],
  [['sales', 'benta', 'net sales', 'total sales', 'net', 'kita', 'income', 'revenue', 'daily sales'], ['net']],
  [['gross', 'gross sales', 'sales before discount', 'sales before discounts'], ['gross']],
  [['discount', 'discounts', 'diskwento', 'less discount', 'less discounts'], ['discounts', 'amount']],
  [['orders', 'order count', 'no of orders', 'number of orders', 'bilang ng order', 'transactions', 'no of transactions', 'txn', 'tc', 'transaction count'], ['orders']],
  [['average order', 'ave order', 'avg order', 'aov', 'average ticket', 'avg ticket', 'ave ticket', 'average check', 'ave check', 'ticket average', 'average sale', 'average per order'], ['aov']],
  [['collected', 'cash received', 'money received', 'natanggap', 'collection', 'collections', 'bayad', 'paid'], ['collected', 'received']],
  [['unpaid', 'utang', 'balance', 'receivable', 'still to collect'], ['unpaid']],
  [['item', 'items', 'product', 'products', 'dish', 'ulam', 'pagkain', 'produkto', 'menu item', 'item name', 'product name', 'menu'], ['item', 'name', 'items']],
  [['qty', 'quantity', 'dami', 'qty sold', 'quantity sold', 'sold', 'pcs', 'pieces', 'units sold'], ['quantity']],
  [['category', 'kategorya', 'group'], ['category', 'name']],
  [['price', 'presyo', 'unit price', 'price each', 'srp'], ['unit_price', 'avg_price']],
  [['share', 'percent', 'percentage', 'share of sales', 'contribution'], ['share']],
  [['cashier', 'kahera', 'kahero', 'staff', 'crew', 'server'], ['cashier', 'who', 'recorded_by']],
  [['customer', 'customer name', 'suki', 'pangalan', 'name', 'buyer', 'client'], ['customer', 'name']],
  [['contact', 'phone', 'mobile', 'number', 'contact number', 'cellphone', 'cp number'], ['contact']],
  [['payment', 'payment method', 'mode of payment', 'mop', 'paid via', 'paraan ng bayad'], ['payment_method', 'method', 'name']],
  [['total', 'amount', 'halaga', 'kabuuan', 'order total', 'grand total', 'total amount'], ['total', 'amount', 'net', 'value', 'gross']],
  [['order no', 'order number', 'order', 'receipt', 'resibo', 'receipt no', 'or no', 'or number', 'invoice', 'ticket'], ['order_no', 'invoice_no']],
  [['order type', 'type', 'dine in or take out', 'service type'], ['order_type', 'kind', 'name']],
  [['status'], ['status', 'payment_status']],
  [['branch', 'sangay', 'store', 'outlet', 'location'], ['branch', 'name']],
  [['table', 'mesa', 'table no'], ['table']],
  [['service charge', 'sc'], ['service']],
  [['delivery fee', 'delivery', 'df', 'shipping'], ['delivery']],
  [['notes', 'note', 'remarks', 'paalala', 'memo'], ['notes', 'note']],
  [['ingredient', 'sangkap', 'stock item', 'raw material', 'material'], ['ingredient']],
  [['unit', 'uom', 'yunit'], ['unit']],
  [['on hand', 'stock', 'balance stock', 'ending', 'ending stock', 'end', 'natira', 'closing'], ['closing', 'quantity', 'balance']],
  [['beginning', 'opening', 'start', 'beginning stock', 'simula'], ['opening']],
  [['received', 'delivery in', 'deliveries', 'stock in', 'in', 'dumating'], ['received', 'collected']],
  [['used', 'usage', 'nagamit', 'stock out', 'out', 'consumed'], ['used']],
  [['waste', 'wasted', 'spoilage', 'sira', 'tapon'], ['wasted']],
  [['missing', 'variance', 'kulang', 'shortage', 'nawawala'], ['missing', 'difference']],
  [['expense', 'expenses', 'gastos', 'particulars', 'paid to', 'supplier', 'payee', 'vendor'], ['paid_to', 'category']],
  [['over short', 'over or short', 'short', 'over', 'sobra kulang'], ['difference']],
  [['expected', 'expected cash', 'cash expected'], ['expected']],
  [['counted', 'actual', 'actual cash', 'cash count', 'bilang'], ['final_count', 'counted']],
  [['reason', 'dahilan'], ['reason', 'cancel_reason']],
  [['line', 'description', 'account', 'detalye'], ['line', 'details', 'detail']],
]

const WORD_INDEX: ReadonlyMap<string, readonly string[]> = new Map(WORDS.flatMap(([words, ids]) => words.map((word) => [word, ids] as const)))

/** The column a heading most plainly means on this sheet, or null. */
export function guessColumn(heading: string, columns: readonly ExportColumn[]): ExportColumn | null {
  const wanted = foldWords(heading)
  if (!wanted) return null
  const same = columns.find((column) => foldWords(column.header) === wanted || foldWords(column.id) === wanted)
  if (same) return same
  const ids = WORD_INDEX.get(wanted)
  if (!ids) return null
  for (const id of ids) {
    const column = columns.find((entry) => entry.id === id)
    if (column) return column
  }
  return null
}

export interface TabGuess {
  sheet: SheetId
  /** One per heading, in the owner's order: the matched column id or null. */
  columns: (string | null)[]
  matched: number
}

/**
 * The sheets a tab's headings match best, most matches first (ties keep the
 * catalogue's order). `columnsOf` gives the columns THIS account may have of
 * a sheet, or null when it may not have the sheet at all.
 */
export function guessTab(headings: readonly string[], sheets: readonly SheetId[], columnsOf: (sheet: SheetId) => readonly ExportColumn[] | null): TabGuess[] {
  return sheets
    .flatMap((sheet): TabGuess[] => {
      const columns = columnsOf(sheet)
      if (!columns) return []
      const used = new Set<string>()
      const matches = headings.map((heading) => {
        const column = guessColumn(heading, columns)
        // The owner's sheet rarely shows one figure twice: a second heading that lands on it stays blank for Owl to judge.
        if (!column || used.has(column.id)) return null
        used.add(column.id)
        return column.id
      })
      return [{ sheet, columns: matches, matched: matches.filter((id) => id !== null).length }]
    })
    .sort((a, b) => b.matched - a.matched)
}

/** "a day" from "one business day: orders, sales…" */
export function rowIsShort(sheet: SheetId): string {
  return EXPORT_SHEETS[sheet].rowIs
    .split(':')[0]
    .replace(/^one (?=[aeiou])/i, 'an ')
    .replace(/^one /, 'a ')
}
