/**
 * Reads the store's cash and money books for an export: shifts, cash in and
 * out, remittances, day closes, expenses and profit (stock is `stock-read.ts`,
 * the activity log `activity-read.ts`). Each goes through the CALLER's session client
 * (or the reader that book's own screen uses), so row-level security and the
 * book's own staff key decide what comes back. Never a service-role client.
 *
 * Every reader refuses instead of cutting short: a book past its row cap, or
 * one the database would not hand over, is an `ExportError` with a sentence.
 */

import { asCashRpcClient } from '@/lib/cash/cash-rpc'
import { readCashSummary } from '@/lib/cash/cash-reports'
import { DAY_CLOSE_COLUMNS, parseDayClose } from '@/lib/cash/day-close'
import { REMITTANCE_COLUMNS, parseRemittance, remittanceDifferenceCents, type Remittance } from '@/lib/cash/remittances'
import { GROUP_LABELS } from '@/lib/expenses/categories'
import { buildExportRows } from '@/lib/expenses/export'
import { loadExpenseExport } from '@/lib/expenses/read/export-read'
import { EXPENSE_LINE_GROUPS } from '@/lib/reports/profit-facts'
import { buildProfitReport } from '@/lib/reports/profit-model'
import { readExpenseCategories, readProfitSummary } from '@/lib/reports/read/report-rpc'
import { manilaDate, manilaDateTime, manilaTime, pesos, text, typed, words } from '../cells'
import { ExportError } from '../errors'
import type { ExportRow } from '../types'
import { MAX_BOOK_ROWS, branchName, countOf, inBranch, iso, round2, tooMany, type BookSheetRows, type BookWindow } from './book-window'
import { readAll } from './detail-read'

// ── Shifts ────────────────────────────────────────────────────────────────

const CLOSE_KIND_LABELS: Readonly<Record<string, string>> = { counted: 'Counted', forced: 'Closed by a manager', auto: 'Closed automatically' }
const HOUR_MS = 60 * 60 * 1000

export async function readShiftSheet(window: BookWindow): Promise<BookSheetRows> {
  const result = await readCashSummary(asCashRpcClient(window.client), {
    tenantId: window.tenantId,
    fromDay: window.fromDay,
    toDay: window.toDay,
    outletId: window.branch.p_outlet,
  })
  if (!result.ok) throw new ExportError(`Shifts could not be read: ${result.error.message}`, result.error.kind === 'forbidden' ? 403 : 502)
  const rows = result.data
    .filter((shift) => inBranch(shift.outletId, window.branch))
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
    .map((shift): ExportRow => {
      const opened = Date.parse(shift.openedAt)
      const closed = shift.closedAt ? Date.parse(shift.closedAt) : null
      return {
        business_day: shift.businessDay,
        branch: branchName(shift.outletId, window.outletNames),
        cashier: shift.staffName,
        drawer: text(shift.drawerName),
        opened: manilaDateTime(opened),
        closed: closed === null ? 'Still open' : manilaDateTime(closed),
        hours: closed === null ? null : round2((closed - opened) / HOUR_MS),
        close_kind: shift.closeKind ? (CLOSE_KIND_LABELS[shift.closeKind] ?? words(shift.closeKind)) : null,
        expected: shift.expectedCents === null ? null : pesos(shift.expectedCents),
        first_count: shift.firstCountCents === null ? null : pesos(shift.firstCountCents),
        final_count: shift.finalCountCents === null ? null : pesos(shift.finalCountCents),
        difference: shift.differenceCents === null ? null : pesos(shift.differenceCents),
        remittance: shift.remittanceStatus ? words(shift.remittanceStatus) : null,
        shift_id: shift.shiftId,
      }
    })
  return { rows, total: rows.length, notes: ['Over / short = cash counted minus cash expected. A minus is short.'] }
}

// ── Cash in and out ───────────────────────────────────────────────────────

interface CashMoveRow {
  id: string
  shift_id: string
  outlet_id: string | null
  kind: string
  amount: number | string
  reason: string | null
  recorded_by_name: string | null
  taken_by_name: string | null
  to_safe: boolean | null
  created_at: string
}

const CASH_MOVE_COLUMNS = 'id, shift_id, outlet_id, kind, amount, reason, recorded_by_name, taken_by_name, to_safe, created_at'
const CASH_MOVE_LABELS: Readonly<Record<string, string>> = { collect: 'Cash collected from the drawer', pay_in: 'Cash put in', pay_out: 'Cash paid out' }

function cashMovesQuery(window: BookWindow, columns: string, options?: { count: 'exact'; head: true }) {
  let query = window.client
    .from('shift_cash_movements')
    .select(columns, options)
    .eq('tenant_id', window.tenantId)
    .gte('created_at', iso(window.start))
    .lt('created_at', iso(window.end))
  if (window.branch.p_outlet !== null) query = query.eq('outlet_id', window.branch.p_outlet)
  if (window.branch.p_unassigned) query = query.is('outlet_id', null)
  return query
}

export async function readCashMoveSheet(window: BookWindow): Promise<BookSheetRows> {
  const page = (from: number, to: number) =>
    cashMovesQuery(window, CASH_MOVE_COLUMNS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
  let stored: CashMoveRow[]
  let total: number
  if (window.peek !== null) {
    total = await countOf('cash movements', cashMovesQuery(window, 'id', { count: 'exact', head: true }))
    const { data, error } = await page(0, window.peek - 1)
    if (error) throw new ExportError('The cash movements could not be read. Try again in a moment.', 502)
    stored = (data ?? []) as unknown as CashMoveRow[]
  } else {
    stored = (await readAll('cash movements', page as never, { cap: MAX_BOOK_ROWS, pageSize: window.pageSize })) as CashMoveRow[]
    if (stored.length > MAX_BOOK_ROWS) throw tooMany('cash movements')
    total = stored.length
  }
  const rows = stored.map((move): ExportRow => {
    const at = Date.parse(move.created_at)
    const amount = Number(move.amount ?? 0)
    return {
      date: manilaDate(at),
      time: manilaTime(at),
      branch: branchName(move.outlet_id, window.outletNames),
      kind: CASH_MOVE_LABELS[move.kind] ?? words(move.kind),
      // Money into the drawer is +, money out of it is −.
      amount: round2(move.kind === 'pay_in' ? Math.abs(amount) : -Math.abs(amount)),
      reason: text(move.reason),
      recorded_by: text(move.recorded_by_name),
      taken_by: text(move.taken_by_name),
      to_safe: move.to_safe ? 'Yes' : null,
      shift_id: move.shift_id,
    }
  })
  return { rows, total, notes: ['Cash put in is a plus; cash paid out or collected from the drawer is a minus. Sales are not listed here.'] }
}

// ── Remittances ───────────────────────────────────────────────────────────

const REMITTANCE_KIND_LABELS: Readonly<Record<Remittance['kind'], string>> = { shift: 'End of shift', pickup: 'Collected mid-shift' }
const REMITTANCE_STATUS_LABELS: Readonly<Record<Remittance['status'], string>> = {
  pending: 'Waiting to be received',
  accepted: 'Received',
  disputed: 'Disputed',
  resolved: 'Settled',
}

interface Counted {
  count: number | null
  error: { message: string } | null
}
interface Paged {
  data: unknown[] | null
  error: { message: string } | null
}

/**
 * One table of a book through the caller's session: every row past the page
 * size, or (a preview) the count and the first rows only.
 */
async function readBookTable(
  window: BookWindow,
  what: string,
  count: () => PromiseLike<Counted>,
  page: (from: number, to: number) => PromiseLike<Paged>,
): Promise<{ stored: unknown[]; total: number }> {
  if (window.peek !== null) {
    const total = await countOf(what, count())
    const { data, error } = await page(0, window.peek - 1)
    if (error) throw new ExportError(`The ${what} could not be read. Try again in a moment.`, 502)
    return { stored: data ?? [], total }
  }
  const stored = await readAll<unknown>(what, page, { cap: MAX_BOOK_ROWS, pageSize: window.pageSize })
  if (stored.length > MAX_BOOK_ROWS) throw tooMany(what)
  return { stored, total: stored.length }
}

function remittancesQuery(window: BookWindow, columns: string, options?: { count: 'exact'; head: true }) {
  // By when the cash was handed over, like Cash in and out (a pickup may carry no business day).
  let query = window.client
    .from('cash_remittances')
    .select(columns, options)
    .eq('tenant_id', window.tenantId)
    .gte('created_at', iso(window.start))
    .lt('created_at', iso(window.end))
  if (window.branch.p_outlet !== null) query = query.eq('outlet_id', window.branch.p_outlet)
  if (window.branch.p_unassigned) query = query.is('outlet_id', null)
  return query
}

export async function readRemittanceSheet(window: BookWindow): Promise<BookSheetRows> {
  const { stored, total } = await readBookTable(
    window,
    'remittances',
    () => remittancesQuery(window, 'id', { count: 'exact', head: true }),
    (from, to) => remittancesQuery(window, REMITTANCE_COLUMNS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to),
  )
  const rows = stored.map((raw): ExportRow => {
    const remittance = parseRemittance(raw)
    const at = Date.parse(remittance.createdAt)
    const difference = remittanceDifferenceCents(remittance)
    const how = remittance.acceptMethod === 'pin' ? 'PIN on the cashier’s device' : remittance.acceptMethod === 'app' ? 'In the receiver’s app' : null
    return {
      business_day: remittance.businessDay,
      date: manilaDate(at),
      time: manilaTime(at),
      branch: branchName(remittance.outletId, window.outletNames),
      kind: REMITTANCE_KIND_LABELS[remittance.kind],
      cashier: remittance.cashierName,
      handed_over: remittance.handedOverCents === null ? null : pesos(remittance.handedOverCents),
      given_to: remittance.toSafe ? 'The store safe' : text(remittance.remittedToName),
      status: REMITTANCE_STATUS_LABELS[remittance.status],
      received: remittance.receivedCents === null ? null : pesos(remittance.receivedCents),
      difference: difference === null ? null : pesos(difference),
      received_by: text(remittance.receivedByName),
      received_at: remittance.receivedAt ? manilaDateTime(Date.parse(remittance.receivedAt)) : null,
      how: how && remittance.isSelfReceived ? `${how} (received by the same person)` : how,
      receiver_note: text(remittance.receiverNote),
      dispute_reason: text(remittance.disputeReason),
      resolved_by: text(remittance.resolvedByName),
      resolved_note: text(remittance.resolvedNote),
      shift_id: remittance.shiftId,
    }
  })
  return {
    rows,
    total,
    notes: ['Difference = received minus handed over; a minus means less arrived. Blank “Handed over” = the drawer was closed without a count.'],
  }
}

// ── Day closes ────────────────────────────────────────────────────────────

function dayClosesQuery(window: BookWindow, columns: string, options?: { count: 'exact'; head: true }) {
  let query = window.client
    .from('business_day_closes')
    .select(columns, options)
    .eq('tenant_id', window.tenantId)
    .gte('business_day', window.fromDay)
    .lte('business_day', window.toDay)
  if (window.branch.p_outlet !== null) query = query.eq('outlet_id', window.branch.p_outlet)
  if (window.branch.p_unassigned) query = query.is('outlet_id', null)
  return query
}

export async function readDayCloseSheet(window: BookWindow): Promise<BookSheetRows> {
  const { stored, total } = await readBookTable(
    window,
    'day closes',
    () => dayClosesQuery(window, 'id', { count: 'exact', head: true }),
    (from, to) =>
      dayClosesQuery(window, DAY_CLOSE_COLUMNS)
        .order('business_day', { ascending: true })
        .order('version', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )
  const money = (cents: number | null | undefined): number | null => (cents === null || cents === undefined ? null : pesos(cents))
  const rows = stored.map((raw): ExportRow => {
    const close = parseDayClose(raw)
    const { sales, drawers } = close.snapshot
    return {
      business_day: close.businessDay,
      branch: branchName(close.outletId, window.outletNames),
      version: close.version,
      status: close.status === 'reopened' ? 'Reopened' : 'Closed',
      closed_by: close.closedByName,
      closed_at: manilaDateTime(Date.parse(close.closedAt)),
      orders: sales ? sales.orders : null,
      net: sales ? pesos(sales.netCents) : null,
      discounts: money(sales?.discountCents),
      expected: money(drawers.totals.expectedCents),
      counted: money(drawers.totals.countedCents),
      difference: money(drawers.totals.varianceCents),
      handed_over: money(drawers.totals.handedOverCents),
      received: money(drawers.totals.receivedCents),
      cash_to_account: money(close.snapshot.cashToAccountForCents),
      deposit: money(close.depositCents),
      deposit_to: text(close.depositTo),
      deposit_ref: text(close.depositRef),
      forced_shifts: close.forcedShiftIds.length,
      open_remittances: close.unsettledRemittanceIds.length,
      note: text(close.note),
      reopened_by: text(close.reopenedByName),
      reopened_at: close.reopenedAt ? manilaDateTime(Date.parse(close.reopenedAt)) : null,
      reopen_reason: text(close.reopenReason),
    }
  })
  return {
    rows,
    total,
    notes: [
      'The figures are the ones frozen when the day was closed. A day that was reopened and closed again has one row per version; the highest version is the current one.',
      'Blank Sales = this store’s sales are not on the main database, so the close holds the drawers only.',
    ],
  }
}

// ── Expenses ──────────────────────────────────────────────────────────────

const pesoCell = (value: string): number | null => (value === '' ? null : Number(value))

export async function readExpenseSheet(window: BookWindow): Promise<BookSheetRows> {
  const data = await loadExpenseExport(window.client, {
    tenantId: window.tenantId,
    from: window.fromDay,
    to: window.toDay,
    ...(window.branch.p_outlet !== null ? { outletId: window.branch.p_outlet } : window.branch.p_unassigned ? { outletId: null } : {}),
  })
  if (data.isTruncated) throw tooMany('expenses')
  const rows = buildExportRows(data.expenses, data.categories, data.suppliers, data.outlets).map(
    (row): ExportRow => ({
      date: row.Date,
      branch: text(row.Branch),
      category: text(row.Category),
      pl_line: text(row['P&L line']),
      paid_to: text(row['Paid to']),
      tin: text(row.TIN),
      doc_type: text(row['Doc type']),
      invoice_no: text(row['Invoice no.']),
      gross: pesoCell(row.Gross),
      vatable: pesoCell(row.VATable),
      input_vat: pesoCell(row['Input VAT']),
      ewt: pesoCell(row.EWT),
      net_paid: pesoCell(row['Net paid']),
      paid_from: text(row['Paid from']),
      status: row.Status,
      void_reason: text(row['Void reason']),
      recorded_by: text(row['Recorded by']),
      notes: text(row.Notes),
    }),
  )
  return { rows, total: rows.length, notes: ['By the date the money was spent. Voided expenses are listed with the status Void; do not add them in.'] }
}

// ── Profit statement ──────────────────────────────────────────────────────

/** The statement's fixed lines. Owl's get_profit finds its figures by these, so a reworded line stays found. */
export const PROFIT_LINES = {
  orders: 'Orders',
  sales: 'Sales',
  ingredients: 'Less: cost of ingredients',
  gross: 'Gross profit',
  expensesHeading: 'Expenses',
  expenses: 'Total expenses',
  profit: 'Profit',
  categoriesHeading: 'Expenses by category',
  capex: 'Equipment bought (not in profit)',
} as const

export async function readProfitSheet(window: BookWindow): Promise<BookSheetRows> {
  const [figures, categories] = await Promise.all([
    readProfitSummary(window.reportClient, window.reportWindow),
    readExpenseCategories(window.reportClient, window.reportWindow),
  ])
  if (!figures.ok) throw new ExportError(`The profit statement could not be read: ${figures.error.message}`, figures.error.kind === 'forbidden' ? 403 : 502)
  if (!categories.ok) throw new ExportError(`The profit statement could not be read: ${categories.error.message}`, categories.error.kind === 'forbidden' ? 403 : 502)
  const report = buildProfitReport({ figures: figures.data, categories: categories.data, previousCategories: null })
  const net = report.netSalesCents
  const share = (cents: number): number | null => (net > 0 ? cents / net : null)
  const line = (label: string, cents: number, note: string | null = null): ExportRow => ({ line: label, value: pesos(cents), share: share(cents), note })
  const gross = net - report.ingredientCostCents
  const basisNote =
    report.ingredientBasis === 'recipes'
      ? 'From what was sold, at the cost recorded when it left the shelf, plus waste and count losses'
      : 'From the ingredient expenses recorded, because this store does not track stock'
  const rows: ExportRow[] = [
    { line: PROFIT_LINES.orders, value: typed(report.orders, 'count'), share: null, note: 'Cancelled orders are not counted' },
    line(PROFIT_LINES.sales, net, 'Food and drinks after discounts; no service charge or delivery fee'),
    line(PROFIT_LINES.ingredients, report.ingredientCostCents, basisNote),
    line(PROFIT_LINES.gross, gross),
    { line: PROFIT_LINES.expensesHeading, value: null, share: null, note: null },
    ...EXPENSE_LINE_GROUPS.filter((group) => report.byGroup[group] !== 0).map((group) => line(`  ${GROUP_LABELS[group]}`, report.byGroup[group])),
    line(PROFIT_LINES.expenses, report.expensesCents),
    line(PROFIT_LINES.profit, report.profitCents, 'Gross profit less total expenses'),
    { line: PROFIT_LINES.categoriesHeading, value: null, share: null, note: null },
    ...report.byCategory.map((category) => line(`  ${category.name}`, category.cents, GROUP_LABELS[category.group])),
  ]
  if (report.capexCents !== 0) rows.push(line(PROFIT_LINES.capex, report.capexCents, 'Money out, but not an expense of this period'))
  return {
    rows,
    total: rows.length,
    notes: ['For your own records. This is not a BIR filing and not an audited statement.', 'One statement for the whole period picked.'],
  }
}
