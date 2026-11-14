/**
 * Reads the store's other books for an export: shifts, cash in and out,
 * stock, expenses and profit. Each goes through the CALLER's session client
 * (or the reader that book's own screen uses), so row-level security and the
 * book's own staff key decide what comes back. Never a service-role client.
 *
 * Every reader refuses instead of cutting short: a book past its row cap, or
 * one the database would not hand over, is an `ExportError` with a sentence.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { asCashRpcClient } from '@/lib/cash/cash-rpc'
import { readCashSummary } from '@/lib/cash/cash-reports'
import { GROUP_LABELS } from '@/lib/expenses/categories'
import { buildExportRows } from '@/lib/expenses/export'
import { loadExpenseExport } from '@/lib/expenses/read/export-read'
import { readItemCosts, readMovementCosts } from '@/lib/inventory/item-costs'
import { EXPENSE_LINE_GROUPS } from '@/lib/reports/profit-facts'
import { buildProfitReport } from '@/lib/reports/profit-model'
import { readExpenseCategories, readProfitSummary, type ReportRpcClient, type ReportWindow } from '@/lib/reports/read/report-rpc'
import type { ReportBranchArgs } from '@/lib/reports/read/report-scope'
import { manilaDate, manilaDateTime, manilaTime, pesos, text, typed, words } from '../cells'
import { ExportError } from '../errors'
import type { ExportAccess, ExportRow } from '../types'
import { readAll } from './detail-read'

/** Rows one book sheet may list. Over it the export is refused, never cut short. */
export const MAX_BOOK_ROWS = 20_000

export interface BookWindow {
  tenantId: string
  /** Business days, inclusive. */
  fromDay: string
  toDay: string
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  branch: ReportBranchArgs
  outletNames: ReadonlyMap<string, string>
  access: ExportAccess
  /** The caller's session client. */
  client: SupabaseClient
  /** The report engine's client (caller's session), for the profit functions. */
  reportClient: ReportRpcClient
  reportWindow: ReportWindow
  /** Preview: read only the first rows of a long book. */
  peek: number | null
  pageSize?: number
}

export interface BookSheetRows {
  rows: ExportRow[]
  /** The whole book's row count when only its first rows were read; else rows.length. */
  total: number | null
  notes: string[]
}

function branchName(outletId: string | null, names: ReadonlyMap<string, string>): string | null {
  return outletId ? (names.get(outletId) ?? 'Unknown branch') : null
}

function inBranch(outletId: string | null, branch: ReportBranchArgs): boolean {
  if (branch.p_unassigned) return outletId === null
  return branch.p_outlet === null || outletId === branch.p_outlet
}

function tooMany(what: string): ExportError {
  return new ExportError(`There are more than ${MAX_BOOK_ROWS.toLocaleString('en-PH')} ${what} in these dates. Pick a shorter range.`, 400)
}

const iso = (ms: number): string => new Date(ms).toISOString()
const round2 = (value: number): number => Math.round(value * 100) / 100
const num = (value: unknown): number | null => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value))

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

async function countOf(what: string, query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query
  if (error || count === null) throw new ExportError(`The ${what} could not be counted. Try again in a moment.`, 502)
  if (count > MAX_BOOK_ROWS) throw tooMany(what)
  return count
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

// ── Stock ─────────────────────────────────────────────────────────────────

interface ItemRow {
  id: string
  name: string | null
  category: string | null
  stock_unit_id: string | null
  current_qty: number | string | null
  reorder_level: number | string | null
  is_active: boolean | null
  counted_at: string | null
}

interface UnitRow {
  id: string
  abbreviation: string | null
}

interface ShelfRow {
  inventory_item_id: string
  current_qty: number | string | null
  reorder_level: number | string | null
  counted_at: string | null
}

async function readItems(window: BookWindow): Promise<ItemRow[]> {
  return (await readAll(
    'ingredients',
    ((from: number, to: number) =>
      window.client
        .from('inventory_items')
        .select('id, name, category, stock_unit_id, current_qty, reorder_level, is_active, counted_at')
        .eq('tenant_id', window.tenantId)
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)) as never,
    { pageSize: window.pageSize },
  )) as ItemRow[]
}

async function readUnits(window: BookWindow): Promise<Map<string, string>> {
  const units = (await readAll(
    'units',
    ((from: number, to: number) =>
      window.client.from('inventory_units').select('id, abbreviation').eq('tenant_id', window.tenantId).order('id', { ascending: true }).range(from, to)) as never,
    { pageSize: window.pageSize },
  )) as UnitRow[]
  return new Map(units.map((unit) => [unit.id, unit.abbreviation?.trim() ?? '']))
}

async function costsFor(window: BookWindow): Promise<Map<string, number> | null> {
  if (!window.access.has('costs')) return null
  return readItemCosts(window.client as never, window.tenantId)
}

function stockState(quantity: number, reorder: number): string {
  if (quantity <= 0) return 'Out'
  return reorder > 0 && quantity <= reorder ? 'Low' : 'OK'
}

export async function readStockOnHandSheet(window: BookWindow, now: number): Promise<BookSheetRows> {
  const oneBranch = window.branch.p_outlet
  const [items, units, costs, shelves] = await Promise.all([
    readItems(window),
    readUnits(window),
    costsFor(window),
    oneBranch === null
      ? Promise.resolve(null)
      : (readAll(
          'branch stock',
          ((from: number, to: number) =>
            window.client
              .from('inventory_stock')
              .select('inventory_item_id, current_qty, reorder_level, counted_at')
              .eq('tenant_id', window.tenantId)
              .eq('outlet_id', oneBranch)
              .order('inventory_item_id', { ascending: true })
              .range(from, to)) as never,
          { pageSize: window.pageSize },
        ) as Promise<ShelfRow[]>),
  ])
  const shelfByItem = shelves ? new Map(shelves.map((shelf) => [shelf.inventory_item_id, shelf])) : null
  const rows = items
    .filter((item) => item.is_active !== false)
    .map((item): ExportRow => {
      // One branch: its own shelf, and no shelf row means zero. Whole store: the ingredient's total.
      const shelf = shelfByItem ? shelfByItem.get(item.id) : undefined
      const quantity = Number((shelfByItem ? shelf?.current_qty : item.current_qty) ?? 0)
      const reorder = Number((shelfByItem ? shelf?.reorder_level : item.reorder_level) ?? 0)
      const countedAt = shelfByItem ? (shelf?.counted_at ?? null) : item.counted_at
      const cost = costs?.get(item.id) ?? null
      return {
        ingredient: text(item.name),
        category: text(item.category),
        quantity,
        unit: item.stock_unit_id ? (units.get(item.stock_unit_id) ?? null) : null,
        reorder_level: reorder > 0 ? reorder : null,
        state: stockState(quantity, reorder),
        unit_cost: cost === null ? null : round2(cost),
        value: cost === null ? null : round2(Math.max(0, quantity) * cost),
        last_counted: countedAt ? manilaDate(Date.parse(countedAt)) : null,
      }
    })
  return {
    rows,
    total: rows.length,
    notes: [`What is on the shelf now (${manilaDateTime(now)}), not on the dates picked. Ingredients switched off are left out.`],
  }
}

interface MovementRow {
  id: string
  inventory_item_id: string
  outlet_id: string | null
  reason: string
  quantity_delta: number | string
  balance_after: number | string | null
  note: string | null
  order_id: string | null
  created_at: string | null
}

const MOVEMENT_COLUMNS = 'id, inventory_item_id, outlet_id, reason, quantity_delta, balance_after, note, order_id, created_at'
const MOVEMENT_LABELS: Readonly<Record<string, string>> = {
  receive: 'Received',
  sale: 'Sold',
  void: 'Sale taken back',
  waste: 'Wasted',
  stocktake: 'Counted',
  transfer_out: 'Sent to a branch',
  transfer_in: 'Arrived from a branch',
}

function movementsQuery(window: BookWindow, columns: string, options?: { count: 'exact'; head: true }) {
  let query = window.client
    .from('stock_movements')
    .select(columns, options)
    .eq('tenant_id', window.tenantId)
    .gte('created_at', iso(window.start))
    .lt('created_at', iso(window.end))
  if (window.branch.p_outlet !== null) query = query.eq('outlet_id', window.branch.p_outlet)
  if (window.branch.p_unassigned) query = query.is('outlet_id', null)
  return query
}

export async function readStockMovementSheet(window: BookWindow): Promise<BookSheetRows> {
  const page = (from: number, to: number) =>
    movementsQuery(window, MOVEMENT_COLUMNS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
  let stored: MovementRow[]
  let total: number
  if (window.peek !== null) {
    total = await countOf('stock movements', movementsQuery(window, 'id', { count: 'exact', head: true }))
    const { data, error } = await page(0, window.peek - 1)
    if (error) throw new ExportError('The stock movements could not be read. Try again in a moment.', 502)
    stored = (data ?? []) as unknown as MovementRow[]
  } else {
    stored = (await readAll('stock movements', page as never, { cap: MAX_BOOK_ROWS, pageSize: window.pageSize })) as MovementRow[]
    if (stored.length > MAX_BOOK_ROWS) throw tooMany('stock movements')
    total = stored.length
  }
  const [items, units, costs] = await Promise.all([
    readItems(window),
    readUnits(window),
    window.access.has('costs') && stored.length > 0
      ? readMovementCosts(
          window.client as never,
          window.tenantId,
          stored.map((movement) => movement.id),
        )
      : Promise.resolve(null),
  ])
  const itemById = new Map(items.map((item) => [item.id, item]))
  const rows = stored.map((movement): ExportRow => {
    const at = movement.created_at ? Date.parse(movement.created_at) : Number.NaN
    const item = itemById.get(movement.inventory_item_id)
    const change = Number(movement.quantity_delta ?? 0)
    const cost = costs?.get(movement.id) ?? null
    return {
      date: Number.isNaN(at) ? null : manilaDate(at),
      time: Number.isNaN(at) ? null : manilaTime(at),
      branch: branchName(movement.outlet_id, window.outletNames),
      ingredient: text(item?.name) ?? 'Deleted ingredient',
      reason: MOVEMENT_LABELS[movement.reason] ?? words(movement.reason),
      change,
      unit: item?.stock_unit_id ? (units.get(item.stock_unit_id) ?? null) : null,
      balance: num(movement.balance_after),
      unit_cost: cost === null ? null : round2(cost),
      value: cost === null ? null : round2(change * cost),
      note: text(movement.note),
      order_id: text(movement.order_id),
    }
  })
  return { rows, total, notes: ['A plus adds to the shelf, a minus takes from it. A blank cost means none was recorded for that movement.'] }
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
