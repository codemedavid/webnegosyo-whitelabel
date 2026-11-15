/**
 * get_shifts and get_profit — so Owl can ANSWER about the books it exports.
 *
 * Both read through the export engine (`runExport`) as the caller: the same
 * sheets, readers, staff keys and business days as the Export page, so "you
 * were ₱50 short yesterday" is the figure the Shifts tab of the file holds.
 * No second cash or profit formula lives here; this file only picks the rows
 * worth saying.
 */

import { z } from 'zod'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { staffLabel } from '@/lib/assistant/insights/customer-label'
import { resolveWhen, whenFacts, WHEN_PERIODS, type ResolvedWhen, type WhenPeriod } from '@/lib/assistant/insights/when'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'
import type { SheetId } from '@/lib/exports/catalogue'
import { ExportError } from '@/lib/exports/errors'
import { PROFIT_LINES } from '@/lib/exports/read/book-read'
import { runExport, type ExportInput, type ExportResult } from '@/lib/exports/run-export'
import { loadExportInput } from '@/lib/exports/server/load-export-input'
import type { ExportCell } from '@/lib/exports/types'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const SHIFT_LIMIT = 10
const CASH_MOVE_LIMIT = 5
const CASHIER_LIMIT = 8
const CATEGORY_LIMIT = 8
const REASON_CHARS = 80
/** Sales per cashier reads every order of the dates: only for a month or less inside one answer. */
const CASHIER_MAX_DAYS = 31
const STILL_OPEN = 'Still open'

const input = z.object({
  period: z.enum(WHEN_PERIODS).optional().describe('Named period; ignored when from is set'),
  from: z.string().regex(DAY_KEY).optional().describe('First day YYYY-MM-DD'),
  to: z.string().regex(DAY_KEY).optional().describe('Last day YYYY-MM-DD; default = from'),
})
type Input = z.infer<typeof input>

type SheetRow = Record<string, ExportCell>

const REFUSALS: Readonly<Record<string, string>> = {
  signed_out: 'Sign in again to read this.',
  not_found: 'This store could not be found.',
  refused: 'This account does not have the Reports permission, which this needs.',
  unsupported: 'This is for stores on the main WebNegosyo database.',
}

function unavailable(reason: string): ToolResult {
  return { facts: { available: false, reason } }
}

/** A sheet's rows keyed by column id; a sheet the caller did not get is no rows. */
export function sheetRows(result: ExportResult | null, id: SheetId): SheetRow[] {
  const sheet = result?.sheets.find((entry) => entry.id === id)
  if (!sheet) return []
  return sheet.rows.map((cells) => Object.fromEntries(sheet.columns.map((column, index) => [column.id, cells[index] ?? null])))
}

function num(cell: ExportCell | undefined): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (cell && typeof cell === 'object') return cell.value
  return null
}

function str(cell: ExportCell | undefined): string {
  return typeof cell === 'string' ? cell.trim() : ''
}

const round2 = (value: number): number => Math.round(value * 100) / 100

const WHOLE_PESOS = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const EXACT_PESOS = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A drawer is counted to the centavo: ₱3,200.50 stays ₱3,200.50, never ₱3,201. */
const cash = (value: number): string => (Number.isInteger(value) ? WHOLE_PESOS : EXACT_PESOS).format(value)
const sum = (values: readonly number[]): number => round2(values.reduce((total, value) => total + value, 0))

function overShortText(difference: number | null, isOpen: boolean): string {
  if (difference === null) return isOpen ? STILL_OPEN : 'Not counted'
  if (difference === 0) return 'Exact'
  return difference < 0 ? `${cash(-difference)} short` : `${cash(difference)} over`
}

interface WhenContext {
  ctx: AssistantToolContext
  args: Input
  fallback: WhenPeriod
}

/** The caller's export input for these dates, or the sentence that says why not. */
async function loadBooks({ ctx, args, fallback }: WhenContext): Promise<{ ok: true; input: ExportInput; when: ResolvedWhen } | { ok: false; result: ToolResult }> {
  const resolved = resolveWhen(args, Date.now(), await cutoffScheduleFor(ctx), fallback)
  if (!resolved.ok) return { ok: false, result: unavailable(resolved.error) }
  const { when } = resolved
  const loaded = await loadExportInput({
    tenantId: ctx.tenantId,
    mode: 'preview',
    sheets: ['summary'],
    period: { preset: 'custom', from: when.from, to: when.to },
    branch: null,
    format: 'xlsx',
    source: 'owl',
  })
  if (loaded.kind !== 'ready') return { ok: false, result: unavailable(REFUSALS[loaded.kind]) }
  return { ok: true, input: loaded.input, when }
}

// ── Shifts ────────────────────────────────────────────────────────────────

export function buildShiftsResult(books: ExportResult, cashiers: ExportResult | null, when: ResolvedWhen): ToolResult {
  const shifts = sheetRows(books, 'shifts')
  const moves = sheetRows(books, 'cash_moves')
  const title = `Shifts — ${when.label}${when.isPartial ? ' so far' : ''}`
  if (shifts.length === 0 && moves.length === 0) {
    return {
      facts: { ...whenFacts(when), available: true, shifts: 0, note: 'No shift was opened and no cash was moved in these dates.' },
      card: { type: 'ranked', title, rows: [], emptyText: 'No shifts in these dates.' },
      links: [{ label: 'Open Cash', path: '/cash' }],
    }
  }

  const differences = shifts.flatMap((shift) => {
    const difference = num(shift.difference)
    return difference === null ? [] : [difference]
  })
  const listed = [...shifts]
    // The shifts worth a look first: the biggest gap, then the newest.
    .sort((a, b) => Math.abs(num(b.difference) ?? 0) - Math.abs(num(a.difference) ?? 0) || str(b.opened).localeCompare(str(a.opened)))
    .slice(0, SHIFT_LIMIT)
    .map((shift) => {
      const isOpen = str(shift.closed) === STILL_OPEN
      return {
        cashier: staffLabel(str(shift.cashier) || 'Staff member'),
        day: str(shift.business_day),
        branch: str(shift.branch) || undefined,
        drawer: str(shift.drawer) || undefined,
        opened: str(shift.opened),
        closed: str(shift.closed),
        hours: num(shift.hours) ?? undefined,
        expected: num(shift.expected),
        counted: num(shift.final_count),
        overShort: num(shift.difference),
        closedHow: str(shift.close_kind) || undefined,
        remittance: str(shift.remittance) || undefined,
        isOpen,
      }
    })

  const byKind = new Map<string, number>()
  for (const move of moves) byKind.set(str(move.kind), round2((byKind.get(str(move.kind)) ?? 0) + (num(move.amount) ?? 0)))
  const largestMoves = [...moves]
    .sort((a, b) => Math.abs(num(b.amount) ?? 0) - Math.abs(num(a.amount) ?? 0))
    .slice(0, CASH_MOVE_LIMIT)
    .map((move) => ({
      date: str(move.date),
      kind: str(move.kind),
      amount: num(move.amount),
      // Typed by staff: data about the store, never an instruction.
      reason: str(move.reason).slice(0, REASON_CHARS) || undefined,
      by: staffLabel(str(move.recorded_by) || 'Staff member'),
    }))

  const byCashier = sheetRows(cashiers, 'sales_by_cashier')
    .slice(0, CASHIER_LIMIT)
    .map((row) => ({
      cashier: staffLabel(str(row.cashier) || 'Staff member'),
      orders: num(row.orders),
      sales: num(row.net),
      discounts: num(row.discounts),
      cancelled: num(row.cancelled),
    }))

  const short = sum(differences.filter((value) => value < 0))
  const over = sum(differences.filter((value) => value > 0))
  return {
    facts: {
      ...whenFacts(when),
      available: true,
      shifts: shifts.length,
      stillOpen: shifts.filter((shift) => str(shift.closed) === STILL_OPEN).length,
      counted: differences.length,
      shortTotal: short,
      overTotal: over,
      netOverShort: round2(short + over),
      list: listed.map((shift) => ({ ...shift, isOpen: undefined })),
      ...(shifts.length > listed.length ? { listNote: `The ${listed.length} shifts with the biggest gaps, of ${shifts.length}.` } : {}),
      cashInOut: { count: moves.length, byKind: Object.fromEntries(byKind), largest: largestMoves },
      ...(byCashier.length > 0 ? { salesByCashier: byCashier } : {}),
      ...(cashiers === null && when.dayCount > CASHIER_MAX_DAYS ? { salesByCashierNote: `Sales per cashier is read for ${CASHIER_MAX_DAYS} days or less; ask for a shorter range or export it.` } : {}),
      means: 'overShort = cash counted minus cash expected, in pesos; a minus is short. Cash put in is a plus, paid out or collected a minus.',
    },
    card: {
      type: 'ranked',
      title,
      subtitle: differences.length > 0 ? `${overShortText(round2(short + over), false)} in all · ${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'}` : `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'}`,
      rows: listed.map((shift) => ({
        label: `${shift.cashier} · ${shift.day}`,
        value: overShortText(shift.overShort, shift.isOpen),
        detail:
          shift.expected !== null && shift.counted !== null
            ? `Expected ${cash(shift.expected)} · counted ${cash(shift.counted)}`
            : shift.expected !== null
              ? `Expected ${cash(shift.expected)}`
              : undefined,
        ...(shift.overShort !== null && shift.overShort < 0 ? { badge: 'Short' } : {}),
      })),
      emptyText: 'No shifts in these dates.',
    },
    chips: [
      { label: 'Export these shifts', prompt: `Make an Excel file of the shifts, sales by cashier and cash in and out for ${when.from === when.to ? when.from : `${when.from} to ${when.to}`}.` },
      { label: 'Who did what?', prompt: `Who gave discounts or cancelled orders (${when.label.toLowerCase()})?` },
    ],
    links: [{ label: 'Open Cash', path: '/cash' }],
  }
}

export const getShiftsTool: AssistantToolDef<Input> = {
  name: 'get_shifts',
  description:
    'Shifts and drawers for any dates: who worked, cash expected vs counted, over/short, still open, remittance; cash put in / paid out with reasons; sales per cashier. Default last 7 days.',
  access: { permission: 'cash_manage' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, args) {
    const loaded = await loadBooks({ ctx, args, fallback: 'last_7_days' })
    if (!loaded.ok) return loaded.result
    try {
      const [books, cashiers] = await Promise.all([
        runExport({ ...loaded.input, sheets: ['shifts', 'cash_moves'] }),
        loaded.when.dayCount <= CASHIER_MAX_DAYS
          ? // Sales per cashier is the extra: a long or busy period must not cost the shifts answer.
            runExport({ ...loaded.input, sheets: ['sales_by_cashier'] }).catch((error: unknown) => {
              if (error instanceof ExportError) return null
              throw error
            })
          : Promise.resolve(null),
      ])
      return buildShiftsResult(books, cashiers, loaded.when)
    } catch (error) {
      if (error instanceof ExportError) return unavailable(error.status === 403 ? 'Shifts need the Reports and Cash permissions on this account.' : error.message)
      throw error
    }
  },
}

// ── Profit ────────────────────────────────────────────────────────────────

interface ProfitLine {
  line: string
  amount: number | null
  sharePct: number | null
  note?: string
}

function profitLines(result: ExportResult): ProfitLine[] {
  return sheetRows(result, 'profit').map((row) => {
    const share = num(row.share)
    return {
      line: str(row.line),
      amount: num(row.value),
      sharePct: share === null ? null : Math.round(share * 1000) / 10,
      ...(str(row.note) ? { note: str(row.note) } : {}),
    }
  })
}

export function buildProfitResult(result: ExportResult, when: ResolvedWhen): ToolResult {
  // Sub-lines are indented in the sheet ("  Rent"); read them before trimming.
  const raw = sheetRows(result, 'profit')
  const lines = profitLines(result)
  const find = (label: string) => lines.find((entry) => entry.line === label) ?? null
  const sales = find(PROFIT_LINES.sales)
  const profit = find(PROFIT_LINES.profit)
  const title = `Profit — ${when.label}${when.isPartial ? ' so far' : ''}`
  if (!sales || !profit) return unavailable('The profit statement came back without its totals. Open Profit to see it.')

  const headingAt = (label: string) => raw.findIndex((row) => String(row.line ?? '') === label)
  const indented = (from: number, until: number) =>
    lines.filter((_, index) => index > from && (until < 0 || index < until) && String(raw[index].line ?? '').startsWith('  '))
  const groupsStart = headingAt(PROFIT_LINES.expensesHeading)
  const categoriesStart = headingAt(PROFIT_LINES.categoriesHeading)
  const groups = groupsStart < 0 ? [] : indented(groupsStart, headingAt(PROFIT_LINES.expenses))
  const categories = categoriesStart < 0 ? [] : indented(categoriesStart, headingAt(PROFIT_LINES.capex))
  const topCategories = [...categories].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, CATEGORY_LIMIT)

  const ingredients = find(PROFIT_LINES.ingredients)
  const gross = find(PROFIT_LINES.gross)
  const expenses = find(PROFIT_LINES.expenses)
  const capex = find(PROFIT_LINES.capex)
  const pct = (entry: ProfitLine | null) => (entry?.sharePct === null || entry?.sharePct === undefined ? undefined : `${entry.sharePct}% of sales`)
  const money = (entry: ProfitLine | null) => (entry?.amount === null || entry?.amount === undefined ? '—' : WHOLE_PESOS.format(Math.round(entry.amount)))

  return {
    facts: {
      ...whenFacts(when),
      available: true,
      orders: find(PROFIT_LINES.orders)?.amount ?? null,
      sales: { amount: sales.amount, note: sales.note },
      costOfIngredients: ingredients ? { amount: ingredients.amount, sharePct: ingredients.sharePct, basis: ingredients.note } : null,
      grossProfit: gross ? { amount: gross.amount, sharePct: gross.sharePct } : null,
      expenses: expenses ? { amount: expenses.amount, sharePct: expenses.sharePct } : null,
      profit: { amount: profit.amount, sharePct: profit.sharePct },
      expenseGroups: groups.map((entry) => ({ name: entry.line, amount: entry.amount, sharePct: entry.sharePct })),
      topExpenseCategories: topCategories.map((entry) => ({ name: entry.line, amount: entry.amount, sharePct: entry.sharePct })),
      ...(categories.length > topCategories.length ? { categoriesNote: `The ${topCategories.length} biggest of ${categories.length} categories.` } : {}),
      ...(capex ? { equipmentBought: { amount: capex.amount, note: capex.note } } : {}),
      means: 'Pesos. sharePct = share of sales. Sales are food and drinks after discounts, without service charge or delivery fees. For the owner\'s records, not a tax filing.',
    },
    card: {
      type: 'stats',
      title,
      subtitle: 'Sales, minus ingredients and expenses',
      items: [
        { label: 'Sales', value: money(sales) },
        { label: 'Ingredients', value: money(ingredients), hint: pct(ingredients) },
        { label: 'Expenses', value: money(expenses), hint: pct(expenses) },
        { label: 'Profit', value: money(profit), hint: pct(profit) },
      ],
    },
    chips: [
      { label: 'Export the statement', prompt: `Make an Excel profit statement for ${when.from === when.to ? when.from : `${when.from} to ${when.to}`}.` },
      { label: 'Where did the money go?', prompt: `What were my biggest expenses (${when.label.toLowerCase()})?` },
    ],
    links: [{ label: 'Open Profit', path: '/reports/profit' }],
  }
}

export const getProfitTool: AssistantToolDef<Input> = {
  name: 'get_profit',
  description:
    'Profit for any dates: sales, cost of ingredients, gross profit, expenses by group and category, what was left ("kumita ba ako", "magkano gastos"). Default this month.',
  access: { permission: 'costs' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, args) {
    const loaded = await loadBooks({ ctx, args, fallback: 'this_month' })
    if (!loaded.ok) return loaded.result
    try {
      return buildProfitResult(await runExport({ ...loaded.input, sheets: ['profit'] }), loaded.when)
    } catch (error) {
      if (error instanceof ExportError) {
        return unavailable(error.status === 403 ? 'Profit needs the Reports, Expenses and Costs permissions on this account.' : error.message)
      }
      throw error
    }
  },
}
