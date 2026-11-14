/**
 * Builds an export: which sheets this caller gets, their rows, and the file.
 *
 * The one path behind the Export page, the Export button on each report and
 * Owl. Reads run as the CALLER (the report engine's RPC client and the session
 * client for row-level sheets), so RLS and the staff keys decide what comes
 * back; this module only arranges it.
 *
 * Nothing is cut short quietly: a range a sheet cannot cover, too many orders
 * or a failed read is a refusal with a sentence the person can act on.
 */

import { strToU8 } from 'fflate'
import { UNASSIGNED_BRANCH } from '@/lib/reports/period'
import type { ReportSection } from '@/lib/reports/api/query-schema'
import { runReportQuery, type ReportSections } from '@/lib/reports/api/run-report-query'
import type { ReportContext } from '@/lib/reports/read/report-context'
import type { ReportRpcClient } from '@/lib/reports/read/report-rpc'
import { UNASSIGNED_LABEL } from '@/lib/reports/report-view-model'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildWorkbook } from './build/workbook'
import { fileSlug, sheetToCsv, zipCsvSheets } from './build/csv'
import {
  EXPORT_SHEETS,
  MAX_DETAIL_DAYS,
  MAX_DETAIL_ORDERS,
  MAX_SUMMARY_DAYS,
  SHEET_REFUSAL_NOTES,
  sheetRefusal,
  visibleColumns,
  type SheetDef,
  type SheetId,
  type SheetRefusal,
} from './catalogue'
import { manilaDateTime } from './cells'
import { ExportError } from './errors'
import {
  countOrders,
  readCustomers,
  readFirstOrders,
  readItems,
  readOrders,
  readPayments,
  readShifts,
  tooManyOrders,
  type DetailClient,
  type DetailWindow,
} from './read/detail-read'
import {
  readCashMoveSheet,
  readExpenseSheet,
  readProfitSheet,
  readShiftSheet,
  readStockMovementSheet,
  readStockOnHandSheet,
  type BookSheetRows,
  type BookWindow,
} from './read/book-read'
import type { DetailData } from './sheets/detail-data'
import { cancelledRows, cashierRows, customerRows, discountRows, orderLineRows, orderRows, paymentRows } from './sheets/detail-sheets'
import { breakdownRows, itemRows, paymentMethodRows, salesByDayRows, summaryRows } from './sheets/summary-sheets'
import type { BuiltSheet, ExportAccess, ExportCellKind, ExportFile, ExportFormat, ExportHeader, ExportRow } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
/** Rows of each sheet a preview shows. */
export const PEEK_ROWS = 5

export interface ExportInput {
  context: ReportContext
  storeName: string
  access: ExportAccess
  /** The report engine's client (caller's session). */
  reportClient: ReportRpcClient
  /** The caller's session client, for row-level sheets. */
  detailClient: DetailClient
  /** The caller's full session client, for the store's other books (shifts, stock, expenses). */
  bookClient?: SupabaseClient
  sheets: readonly SheetId[]
  now: number
  /** Tests only: rows per request, to page over a small fake. */
  pageSize?: number
  /** Tests only: stands in for `PREVIEW_FULL_READ_ORDERS`. */
  previewFullReadOrders?: number
}

export interface LeftOutSheet {
  id: SheetId
  name: string
  reason: SheetRefusal
  note: string
}

export interface ExportResult {
  header: ExportHeader
  sheets: BuiltSheet[]
  leftOut: LeftOutSheet[]
}

export interface PreviewSheet {
  id: string
  name: string
  rowIs: string
  columns: string[]
  /** How each column's cells are written, in the same order as `columns`. */
  kinds: ExportCellKind[]
  /** Exact, or null when a long period's rows are only known once the file is built. */
  rows: number | null
  peek: BuiltSheet['rows']
  notes: readonly string[]
}

export interface ExportPreview {
  header: ExportHeader
  sheets: PreviewSheet[]
  leftOut: LeftOutSheet[]
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

export function exportHeader(context: ReportContext, storeName: string, now: number): ExportHeader {
  const { period, branch } = context
  const range = period.from === period.to ? period.from : `${period.from} to ${period.to}`
  const branchLabel =
    context.lockedBranchLabel ??
    (branch.branch === UNASSIGNED_BRANCH
      ? `${UNASSIGNED_LABEL} orders`
      : branch.branch
        ? (context.outletNames.get(branch.branch) ?? 'One branch')
        : context.isMultiBranch
          ? 'All branches'
          : 'Whole store')
  return {
    storeName,
    periodLabel: period.isPartial ? `${range} (so far)` : range,
    branchLabel,
    asOf: `${manilaDateTime(now)} (Manila time)`,
  }
}

interface Chosen {
  included: SheetDef[]
  leftOut: LeftOutSheet[]
}

function choose(input: ExportInput): Chosen {
  // The page fell back to a default period: an export of the wrong dates would be believed.
  if (input.context.periodError) throw new ExportError(input.context.periodError, 400)
  const audience = { has: input.access.has, isMultiBranch: input.context.isMultiBranch }
  const included: SheetDef[] = []
  const leftOut: LeftOutSheet[] = []
  for (const id of input.sheets) {
    const sheet = EXPORT_SHEETS[id]
    const reason = sheetRefusal(sheet, audience)
    if (reason) leftOut.push({ id, name: sheet.name, reason, note: `${sheet.name} was left out: ${SHEET_REFUSAL_NOTES[reason]}.` })
    else included.push(sheet)
  }
  if (included.length === 0) {
    throw new ExportError(leftOut[0] ? `Nothing to export. ${leftOut[0].note}` : 'Pick at least one sheet to export.', 403)
  }
  const days = dayCount(input.context.period.from, input.context.period.to)
  const detail = included.find((sheet) => sheet.source !== 'summary')
  if (detail && days > MAX_DETAIL_DAYS) {
    throw new ExportError(
      `${detail.name} lists every row, so one file covers up to ${MAX_DETAIL_DAYS} days (you picked ${days}). Pick a shorter range, or export the summary sheets only.`,
      400,
    )
  }
  if (days > MAX_SUMMARY_DAYS) throw new ExportError(`One file covers up to ${MAX_SUMMARY_DAYS} days (you picked ${days}).`, 400)
  return { included, leftOut }
}

function detailWindow(input: ExportInput): DetailWindow {
  const { tenantId, start, end, branch } = input.context.windows.current
  return { tenantId, start, end, branch, pageSize: input.pageSize }
}

async function readSections(input: ExportInput, sheets: readonly SheetDef[]): Promise<ReportSections> {
  const sections = [...new Set(sheets.flatMap((sheet) => sheet.sections))] as ReportSection[]
  if (sections.length === 0) return {}
  // Exports never compare: the previous window is dropped whatever the context carries.
  const context: ReportContext = { ...input.context, compare: null, windows: { current: input.context.windows.current, previous: null } }
  return runReportQuery({ context, client: input.reportClient, sections, grain: 'day', canSeeCosts: false })
}

async function readDetail(input: ExportInput, sheets: readonly SheetDef[], peek: number | null): Promise<DetailData | null> {
  const wanted = new Set(sheets.filter((sheet) => sheet.source === 'detail').map((sheet) => sheet.id))
  if (wanted.size === 0) return null
  const window = detailWindow(input)
  const client = input.detailClient
  const orders = peek === null ? await readOrders(client, window) : await readFirstOrders(client, window, peek)
  const orderIds = orders.map((order) => order.id)
  const customerIds = orders.flatMap((order) => (order.customer_id ? [order.customer_id] : []))
  const [itemsByOrder, paymentsByOrder, shifts, customers] = await Promise.all([
    readItems(client, orderIds, input.pageSize),
    readPayments(client, orderIds, input.pageSize),
    SHEETS_WITH_STAFF_NAMES.some((id) => wanted.has(id)) ? readShifts(client, window) : Promise.resolve([]),
    wanted.has('customers') ? readCustomers(client, window.tenantId, customerIds) : Promise.resolve(new Map()),
  ])
  return {
    orders,
    itemsByOrder,
    paymentsByOrder,
    shifts,
    customers,
    outletNames: input.context.outletNames,
    schedule: input.context.schedule,
    start: window.start,
    end: window.end,
  }
}

/** Sheets that name a cashier: names come from the shifts on record. */
const SHEETS_WITH_STAFF_NAMES: readonly SheetId[] = ['orders', 'payments_received', 'discounts', 'cancelled', 'sales_by_cashier']

type Books = ReadonlyMap<SheetId, BookSheetRows>

function readBook(id: SheetId, window: BookWindow, now: number): Promise<BookSheetRows> | null {
  switch (id) {
    case 'shifts':
      return readShiftSheet(window)
    case 'cash_moves':
      return readCashMoveSheet(window)
    case 'stock_on_hand':
      return readStockOnHandSheet(window, now)
    case 'stock_movements':
      return readStockMovementSheet(window)
    case 'expenses':
      return readExpenseSheet(window)
    case 'profit':
      return readProfitSheet(window)
    default:
      return null
  }
}

/** The store's other books, each through its own reader. `peek` = a preview: long books are counted, not read whole. */
async function readBooks(input: ExportInput, sheets: readonly SheetDef[], peek: number | null): Promise<Books> {
  const wanted = sheets.filter((sheet) => sheet.source === 'book')
  if (wanted.length === 0) return new Map()
  if (!input.bookClient) throw new ExportError(`${wanted[0].name} could not be read. Try again in a moment.`, 502)
  const current = input.context.windows.current
  const window: BookWindow = {
    tenantId: current.tenantId,
    fromDay: input.context.period.from,
    toDay: input.context.period.to,
    start: current.start,
    end: current.end,
    branch: current.branch,
    outletNames: input.context.outletNames,
    access: input.access,
    client: input.bookClient,
    reportClient: input.reportClient,
    reportWindow: current,
    peek,
    pageSize: input.pageSize,
  }
  const read = await Promise.all(
    wanted.map(async (sheet) => {
      const pending = readBook(sheet.id, window, input.now)
      if (!pending) throw new ExportError(`${sheet.name} has no reader.`, 500)
      return [sheet.id, await pending] as const
    }),
  )
  return new Map(read)
}

function rowsFor(sheet: SheetDef, sections: ReportSections, detail: DetailData | null, books: Books): ExportRow[] {
  const data = (): DetailData => {
    if (!detail) throw new ExportError(`${sheet.name} could not be read. Try again in a moment.`, 502)
    return detail
  }
  switch (sheet.id) {
    case 'summary':
      return summaryRows(sections)
    case 'sales_by_day':
      return salesByDayRows(sections)
    case 'items':
      return itemRows(sections)
    case 'categories':
      return breakdownRows(sections, 'categories', 'categories')
    case 'order_types':
      return breakdownRows(sections, 'order_types', 'order types')
    case 'channels':
      return breakdownRows(sections, 'channels', 'channels')
    case 'branches':
      return breakdownRows(sections, 'branches', 'branches')
    case 'payments_by_method':
      return paymentMethodRows(sections)
    case 'orders':
      return orderRows(data())
    case 'order_lines':
      return orderLineRows(data())
    case 'payments_received':
      return paymentRows(data())
    case 'customers':
      return customerRows(data())
    case 'discounts':
      return discountRows(data())
    case 'cancelled':
      return cancelledRows(data())
    case 'sales_by_cashier':
      return cashierRows(data())
    default: {
      const book = books.get(sheet.id)
      if (!book) throw new ExportError(`${sheet.name} could not be read. Try again in a moment.`, 502)
      return book.rows
    }
  }
}

function sheetNotes(sheet: SheetDef, input: ExportInput, detail: DetailData | null): string[] {
  const notes: string[] = []
  if (sheet.id === 'orders' && detail && detail.shifts.length === 0) notes.push('Cashier and Shift are blank: no shifts on record for these dates, or your account cannot see shifts.')
  if (sheet.id === 'orders' && !input.access.has('customers')) notes.push('Customer names and numbers are left out: your account does not have access to customers.')
  if (sheet.id === 'payments_received') {
    notes.push(
      'Payments recorded on the orders placed in this period, whenever the money came in.',
      'An order marked paid with no payment recorded has no row here, so this sheet can add up to less than Money received on the Summary.',
    )
  }
  if (sheet.id === 'sales_by_cashier') notes.push('Only orders rung up on the register have a cashier. Names come from the shifts on record for these dates.')
  if (sheet.id === 'discounts') notes.push('Cancelled orders are not listed. A discount off a delivery fee is counted here too, so this can add up to more than “Less: discounts” on the Summary, which is food only.')
  if (sheet.id === 'customers') notes.push('Cancelled orders are not counted. A first-timer placed their first order ever inside this period.')
  if (input.context.isMixedBackend && sheet.source === 'detail') notes.push('Orders from before this store moved to the current system are not included.')
  return notes
}

function build(sheet: SheetDef, input: ExportInput, sections: ReportSections, detail: DetailData | null, books: Books): BuiltSheet {
  const columns = visibleColumns(sheet, input.access)
  const rows = rowsFor(sheet, sections, detail, books).map((row) => columns.map((column) => row[column.id] ?? null))
  return { id: sheet.id, name: sheet.name, columns, rows, notes: [...(books.get(sheet.id)?.notes ?? []), ...sheetNotes(sheet, input, detail)] }
}

/** Every sheet the caller asked for and may have, fully read. */
export async function runExport(input: ExportInput): Promise<ExportResult> {
  const { included, leftOut } = choose(input)
  const [sections, detail, books] = await Promise.all([
    readSections(input, included),
    readDetail(input, included, null),
    readBooks(input, included, null),
  ])
  return {
    header: exportHeader(input.context, input.storeName, input.now),
    sheets: included.map((sheet) => build(sheet, input, sections, detail, books)),
    leftOut,
  }
}

/** Up to this many orders a preview reads every row, so its counts and first rows are exact. */
export const PREVIEW_FULL_READ_ORDERS = 1500
/** Sheets that add orders up (a customer, a cashier): their rows mean nothing over a handful of orders. */
const TALLY_SHEETS: ReadonlySet<SheetId> = new Set<SheetId>(['customers', 'sales_by_cashier'])
const TALLY_PREVIEW_NOTE = 'This sheet adds up every order, so its rows are worked out when the file is made.'

/**
 * What the file would hold. Summary sheets are read (a handful of report
 * calls). Row-level sheets: a period of up to `PREVIEW_FULL_READ_ORDERS`
 * orders is read whole, so every count is exact; a bigger one is COUNTED and
 * only its first orders read, and a sheet that adds orders up shows its
 * columns without rows rather than figures for five orders.
 * Refuses exactly what `runExport` would refuse.
 */
export async function previewExport(input: ExportInput): Promise<ExportPreview> {
  const { included, leftOut } = choose(input)
  const hasDetail = included.some((sheet) => sheet.source === 'detail')
  const [sections, orderCount, books] = await Promise.all([
    readSections(input, included),
    hasDetail ? countOrders(input.detailClient, detailWindow(input)) : Promise.resolve(0),
    readBooks(input, included, PEEK_ROWS),
  ])
  if (orderCount > MAX_DETAIL_ORDERS) throw tooManyOrders(orderCount)
  const isWhole = orderCount <= (input.previewFullReadOrders ?? PREVIEW_FULL_READ_ORDERS)
  const detail = await readDetail(input, included, isWhole ? null : PEEK_ROWS)
  const sheets = included.map((sheet): PreviewSheet => {
    const built = build(sheet, input, sections, detail, books)
    const book = books.get(sheet.id)
    const isExact = sheet.source === 'summary' || (sheet.source === 'detail' && isWhole)
    const isHeld = !isExact && TALLY_SHEETS.has(sheet.id)
    return {
      id: sheet.id,
      name: sheet.name,
      rowIs: sheet.rowIs,
      columns: built.columns.map((column) => column.header),
      kinds: built.columns.map((column) => column.kind),
      rows: book ? book.total : isExact ? built.rows.length : sheet.id === 'orders' ? orderCount : null,
      peek: isHeld ? [] : built.rows.slice(0, PEEK_ROWS),
      notes: isHeld ? [...built.notes, TALLY_PREVIEW_NOTE] : built.notes,
    }
  })
  return { header: exportHeader(input.context, input.storeName, input.now), sheets, leftOut }
}

function fileBase(result: ExportResult, context: ReportContext): string {
  const what = result.sheets.length === 1 ? fileSlug(result.sheets[0].name) : 'export'
  const range = context.period.from === context.period.to ? context.period.from : `${context.period.from}_to_${context.period.to}`
  return `${fileSlug(result.header.storeName)}-${what}-${range}`
}

export async function toExportFile(result: ExportResult, context: ReportContext, format: ExportFormat): Promise<ExportFile> {
  const base = fileBase(result, context)
  if (format === 'xlsx') {
    return {
      name: `${base}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: await buildWorkbook(result.sheets, result.header),
    }
  }
  if (result.sheets.length === 1) {
    return { name: `${base}.csv`, contentType: 'text/csv; charset=utf-8', bytes: strToU8(sheetToCsv(result.sheets[0], result.header)) }
  }
  return { name: `${base}.zip`, contentType: 'application/zip', bytes: zipCsvSheets(result.sheets, result.header) }
}
