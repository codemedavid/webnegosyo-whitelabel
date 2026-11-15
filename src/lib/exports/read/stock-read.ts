/**
 * The stock sheets of an export: what is on the shelf now, every movement of
 * the dates, and "used and missing" (the Daily stock report, day after day).
 * Read through the CALLER's session client; costs only for an account that
 * holds `costs` (the cost functions answer nobody else).
 */

import { tradingDayOf, tradingDayWindow } from '@/lib/business-day/trading-day'
import { nextBusinessDayKey } from '@/lib/inventory/business-day'
import { buildDailyInventoryReport, type DailyReportIngredient, type DailyReportMovement } from '@/lib/inventory/daily-report'
import { readItemCosts, readMovementCosts } from '@/lib/inventory/item-costs'
import type { StockMovementReason } from '@/lib/inventory/stock-ledger'
import { manilaDate, manilaDateTime, manilaTime, text, words } from '../cells'
import { ExportError } from '../errors'
import type { ExportRow } from '../types'
import { MAX_BOOK_ROWS, branchName, countOf, iso, num, round2, tooMany, type BookSheetRows, type BookWindow } from './book-window'
import { readAll } from './detail-read'

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

// ── Stock used and missing ────────────────────────────────────────────────

/** Ledger rows one "used and missing" file may add up. Over it the export is refused, never cut short. */
export const MAX_USAGE_MOVEMENTS = 40_000
/** A preview adds a period this small up whole; a busier one shows its first day only. */
export const PREVIEW_FULL_USAGE_MOVEMENTS = 2_000

const USAGE_COLUMNS = 'id, inventory_item_id, outlet_id, reason, quantity_delta, balance_after, created_at'
const USAGE_NOTE =
  'One row per ingredient per day it moved. Start of day + received - used - wasted + moved between branches + changed by a count = end of day. Missing = what a count found short.'
const USAGE_COST_NOTE =
  "Money is each ingredient's cost today, as on the Daily stock report. The Profit sheet uses the cost recorded at each sale, so the two can differ. A blank cost means the ingredient has no price."

interface UsageMovementRow {
  id: string
  inventory_item_id: string
  outlet_id: string | null
  reason: string
  quantity_delta: number | string
  balance_after: number | string | null
  created_at: string
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000

function tooMuchStockActivity(): ExportError {
  return new ExportError(
    `There is too much stock activity in these dates for one file (more than ${MAX_USAGE_MOVEMENTS.toLocaleString('en-PH')} stock movements). Pick a shorter range.`,
    400,
  )
}

/** Every ledger row of `[start, end)` in the order it happened, or a refusal past the cap. */
async function readUsageMovements(window: BookWindow, start: number, end: number): Promise<UsageMovementRow[]> {
  const slice = { ...window, start, end }
  const page = (from: number, to: number) =>
    movementsQuery(slice, USAGE_COLUMNS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
  const stored = (await readAll('stock movements', page as never, { cap: MAX_USAGE_MOVEMENTS, pageSize: window.pageSize })) as UsageMovementRow[]
  if (stored.length > MAX_USAGE_MOVEMENTS) throw tooMuchStockActivity()
  return stored
}

/** The store's days from `fromDay` to `toDay`, each with its own bounds held inside the window. */
function usageDays(window: BookWindow, fromDay: string, toDay: string): Array<{ day: string; start: number; end: number }> {
  const days: Array<{ day: string; start: number; end: number }> = []
  for (let day = fromDay; day <= toDay; day = nextBusinessDayKey(day)) {
    const bounds = tradingDayWindow(day, window.schedule)
    const start = Math.max(Date.parse(bounds.startIso), window.start)
    const end = Math.min(Date.parse(bounds.endIso), window.end)
    if (start < end) days.push({ day, start, end })
  }
  return days
}

/**
 * The Daily stock report, one day after another: the SAME pure reconciliation
 * the screen runs (`buildDailyInventoryReport`) over each day's slice of the
 * ledger, so a row here is the row that day's screen shows.
 */
function usageRows(
  days: ReadonlyArray<{ day: string; start: number; end: number }>,
  stored: readonly UsageMovementRow[],
  ingredients: readonly DailyReportIngredient[],
  hasCosts: boolean,
): ExportRow[] {
  const priced = new Set(ingredients.filter((ingredient) => ingredient.unitCost > 0).map((ingredient) => ingredient.id))
  const rows: ExportRow[] = []
  let next = 0
  for (const { day, start, end } of days) {
    // Rows arrive in time order, so each day takes the next run of them.
    while (next < stored.length && Date.parse(stored[next].created_at) < start) next += 1
    const movements: DailyReportMovement[] = []
    while (next < stored.length && Date.parse(stored[next].created_at) < end) {
      const row = stored[next]
      movements.push({
        inventoryItemId: row.inventory_item_id,
        reason: row.reason as StockMovementReason,
        quantityDelta: Number(row.quantity_delta ?? 0),
        balanceAfter: Number(row.balance_after ?? 0),
        createdAt: row.created_at,
        outletId: row.outlet_id,
      })
      next += 1
    }
    if (movements.length === 0) continue
    const report = buildDailyInventoryReport({ movements, ingredients })
    // The screen ranks by money missing; a file reads better by name, and stays the same without the costs key.
    const byName = [...report.rows].sort((a, b) => a.name.localeCompare(b.name) || a.inventoryItemId.localeCompare(b.inventoryItemId))
    for (const row of byName) {
      const money = (value: number): number | null => (hasCosts && priced.has(row.inventoryItemId) ? round2(value) : null)
      rows.push({
        day,
        ingredient: row.name,
        unit: row.stockUnitAbbreviation || null,
        opening: round4(row.opening),
        received: round4(row.received),
        used: round4(row.sold),
        wasted: round4(row.waste),
        transferred: round4(row.transferred),
        count_change: round4(row.countAdjustment),
        missing: round4(row.shrinkage),
        closing: round4(row.closing),
        counted: row.wasCounted ? 'Yes' : 'No',
        used_cost: money(row.cogs),
        wasted_cost: money(row.wasteCost),
        missing_cost: money(row.shrinkageCost),
      })
    }
  }
  return rows
}

export async function readStockUsageSheet(window: BookWindow): Promise<BookSheetRows> {
  const hasCosts = window.access.has('costs')
  let days = usageDays(window, window.fromDay, window.toDay)
  let stored: UsageMovementRow[]
  let isWhole = true
  if (window.peek === null) {
    stored = await readUsageMovements(window, window.start, window.end)
  } else {
    const { count, error } = await movementsQuery(window, 'id', { count: 'exact', head: true })
    if (error || count === null) throw new ExportError('The stock movements could not be counted. Try again in a moment.', 502)
    if (count > MAX_USAGE_MOVEMENTS) throw tooMuchStockActivity()
    if (count <= PREVIEW_FULL_USAGE_MOVEMENTS) {
      stored = await readUsageMovements(window, window.start, window.end)
    } else {
      // Too busy to add up for a preview: show the first day that has activity, whole.
      const first = await movementsQuery(window, 'created_at').order('created_at', { ascending: true }).order('id', { ascending: true }).range(0, 0)
      if (first.error) throw new ExportError('The stock movements could not be read. Try again in a moment.', 502)
      const firstAt = (first.data as unknown as Array<{ created_at: string }> | null)?.[0]?.created_at
      const firstDay = firstAt ? tradingDayOf(firstAt, window.schedule) : window.fromDay
      days = usageDays(window, firstDay, firstDay)
      stored = days.length > 0 ? await readUsageMovements(window, days[0].start, days[0].end) : []
      isWhole = false
    }
  }
  const [items, units, costs] = await Promise.all([readItems(window), readUnits(window), stored.length > 0 ? costsFor(window) : Promise.resolve(null)])
  const ingredients = items.map(
    (item): DailyReportIngredient => ({
      id: item.id,
      name: text(item.name) ?? 'Unnamed ingredient',
      unitCost: costs?.get(item.id) ?? 0,
      stockUnitAbbreviation: item.stock_unit_id ? (units.get(item.stock_unit_id) ?? '') : '',
    }),
  )
  const rows = usageRows(days, stored, ingredients, hasCosts && costs !== null)
  const notes = hasCosts ? [USAGE_NOTE, USAGE_COST_NOTE] : [USAGE_NOTE]
  return { rows, total: isWhole ? rows.length : null, notes: isWhole ? notes : [...notes, 'This preview shows the first day with stock activity. The file has every day.'] }
}
