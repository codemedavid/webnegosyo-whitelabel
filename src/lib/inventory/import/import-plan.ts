/**
 * What each spreadsheet row will do, decided before anything is saved.
 *
 * The rules are the ones a merchant would guess, so the review screen rarely
 * has to explain itself:
 *   - a row naming an ingredient they already have (SKU first, then name)
 *     updates it; any other name adds one;
 *   - a blank cell means "leave it as it is", never "set it to zero";
 *   - a row that cannot be read is held back with a sentence saying why, and
 *     the rest of the file still imports.
 *
 * Two rules they might NOT guess, both protective:
 *   - an existing ingredient's stock is only overwritten when they opted in —
 *     re-importing last week's export must not roll the shelf back a week;
 *   - an existing ingredient keeps its unit. Changing it would re-read every
 *     quantity and recipe line in the new unit (4 kg becoming 4 g).
 */

import type { ColumnMapping } from '@/lib/inventory/import/column-matching'
import { getImportField, type ImportFieldKey } from '@/lib/inventory/import/fields'
import type { ImportSheet, ImportSourceRow } from '@/lib/inventory/import/sheet'
import {
  normalizeUnitText,
  resolveUnit,
  type ImportUnit,
  type UnitOverrides,
} from '@/lib/inventory/import/unit-matching'
import { parseNumberCell, parseYesNoCell } from '@/lib/inventory/import/value-parsing'
import type { InventoryItem } from '@/types/database'

export interface PlanOptions {
  /** Overwrite the on-hand figure of ingredients that already exist. */
  updateExistingStock: boolean
  unitOverrides: UnitOverrides
}

export type RowStatus = 'create' | 'update' | 'unchanged' | 'error'

export interface RowIssue {
  field: ImportFieldKey
  message: string
  /** An error holds the row back; a warning imports it and says what was kept. */
  severity: 'error' | 'warning'
}

export interface FieldChange {
  field: ImportFieldKey
  label: string
  from: string
  to: string
}

/** Structurally an `IngredientInput`, minus the photo an import never sets. */
export interface PlannedIngredientInput {
  name: string
  sku: string | null
  category: string | null
  stock_unit_id: string
  unit_cost: number
  reorder_level: number
  is_prep: boolean
  is_active: boolean
}

export interface PlannedRow {
  rowNumber: number
  status: RowStatus
  name: string
  existingId: string | null
  /** Null only for an error row. */
  input: PlannedIngredientInput | null
  /** A stock count to record, in the ingredient's own unit. */
  onHand: number | null
  changes: FieldChange[]
  issues: RowIssue[]
  /** Set when the row is held back by a unit word nobody has explained yet. */
  unresolvedUnitKey: string | null
}

export interface UnresolvedUnit {
  key: string
  /** The word as first written in the file. */
  label: string
  rowCount: number
}

export interface ImportPlan {
  rows: PlannedRow[]
  summary: Record<RowStatus, number> & { total: number }
  unresolvedUnits: UnresolvedUnit[]
}

export interface ImportRowPayload {
  rowNumber: number
  existingId: string | null
  input: PlannedIngredientInput
  onHand: number | null
}

/** Stock is NUMERIC(16,4); anything closer than this is the same count. */
const QUANTITY_EPSILON = 0.00005

type Cells = Partial<Record<ImportFieldKey, string>>

interface PlanContext {
  units: readonly ImportUnit[]
  options: PlanOptions
  bySku: ReadonlyMap<string, InventoryItem>
  byName: ReadonlyMap<string, InventoryItem>
}

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString()
}

function display(value: string | number | boolean | null): string {
  if (value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return formatNumber(value)
  return value
}

function readCells(row: ImportSourceRow, mapping: ColumnMapping): Cells {
  const cells: Cells = {}
  mapping.forEach((field, index) => {
    if (field) cells[field] = row.cells[index] ?? ''
  })
  return cells
}

function findExisting(cells: Cells, name: string, ctx: PlanContext): InventoryItem | null {
  const sku = cells.sku?.trim().toLowerCase()
  if (sku) {
    const bySku = ctx.bySku.get(sku)
    if (bySku) return bySku
  }
  return name ? (ctx.byName.get(normalizeName(name)) ?? null) : null
}

function error(field: ImportFieldKey, message: string): RowIssue {
  return { field, message, severity: 'error' }
}

type NumberField = 'unit_cost' | 'reorder_level' | 'on_hand'
type YesNoField = 'is_prep' | 'is_active'

function readNumber(cells: Cells, field: NumberField, issues: RowIssue[]): number | null {
  const parsed = parseNumberCell(cells[field] ?? '')
  const { label } = getImportField(field)
  if (parsed.kind === 'blank') return null
  if (parsed.kind === 'invalid') {
    issues.push(error(field, `${label} “${parsed.raw}” isn’t a number`))
    return null
  }
  if (parsed.value < 0) {
    issues.push(error(field, `${label} can’t be below zero`))
    return null
  }
  return parsed.value
}

function readYesNo(cells: Cells, field: YesNoField, issues: RowIssue[]): boolean | null {
  const parsed = parseYesNoCell(cells[field] ?? '')
  if (parsed.kind === 'blank') return null
  if (parsed.kind === 'invalid') {
    issues.push(error(field, `${getImportField(field).label} should be Yes or No, not “${parsed.raw}”`))
    return null
  }
  return parsed.value
}

interface UnitReading {
  unitId: string | null
  unresolvedKey: string | null
}

function readUnit(cells: Cells, match: InventoryItem | null, ctx: PlanContext, issues: RowIssue[]): UnitReading {
  const raw = (cells.unit ?? '').trim()
  const resolved = raw ? resolveUnit(raw, ctx.units, ctx.options.unitOverrides) : null

  if (match) {
    const own = ctx.units.find((unit) => unit.id === match.stock_unit_id)?.abbreviation ?? 'its unit'
    if (raw && resolved?.id !== match.stock_unit_id) {
      issues.push({
        field: 'unit',
        message: `Stays in ${own}. Change a unit on the ingredient itself, so its stock and recipes aren’t re-read in “${raw}”.`,
        severity: 'warning',
      })
    }
    return { unitId: match.stock_unit_id, unresolvedKey: null }
  }

  if (!raw) {
    issues.push(error('unit', 'Add a unit, like kg, g, L or pc'))
    return { unitId: null, unresolvedKey: null }
  }
  if (!resolved) {
    issues.push(error('unit', `Pick which unit “${raw}” means`))
    return { unitId: null, unresolvedKey: normalizeUnitText(raw) }
  }
  return { unitId: resolved.id, unresolvedKey: null }
}

interface RowValues {
  name: string
  sku: string | null
  category: string | null
  unitCost: number | null
  reorderLevel: number | null
  onHand: number | null
  isPrep: boolean | null
  isActive: boolean | null
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function mergeInput(values: RowValues, unitId: string, match: InventoryItem | null): PlannedIngredientInput {
  if (!match) {
    return {
      name: values.name,
      sku: values.sku,
      category: values.category,
      stock_unit_id: unitId,
      unit_cost: values.unitCost ?? 0,
      reorder_level: values.reorderLevel ?? 0,
      is_prep: values.isPrep ?? false,
      is_active: values.isActive ?? true,
    }
  }

  // A name or SKU differing only in case or spacing is the same one; keeping the
  // stored spelling stops every re-import reporting a "change" nobody made.
  const keep = (next: string | null, current: string | null | undefined) =>
    next === null || sameText(next, current) ? (current ?? null) : next

  return {
    name: normalizeName(values.name) === normalizeName(match.name) || !values.name ? match.name : values.name,
    sku: keep(values.sku, match.sku),
    category: keep(values.category, match.category),
    stock_unit_id: match.stock_unit_id,
    unit_cost: values.unitCost ?? match.unit_cost,
    reorder_level: values.reorderLevel ?? match.reorder_level,
    is_prep: values.isPrep ?? match.is_prep,
    is_active: values.isActive ?? match.is_active,
  }
}

const COMPARED_FIELDS: readonly { field: ImportFieldKey; key: keyof PlannedIngredientInput }[] = [
  { field: 'name', key: 'name' },
  { field: 'sku', key: 'sku' },
  { field: 'category', key: 'category' },
  { field: 'unit_cost', key: 'unit_cost' },
  { field: 'reorder_level', key: 'reorder_level' },
  { field: 'is_prep', key: 'is_prep' },
  { field: 'is_active', key: 'is_active' },
]

function diff(input: PlannedIngredientInput, match: InventoryItem): FieldChange[] {
  return COMPARED_FIELDS.flatMap(({ field, key }) => {
    const before = (match[key as keyof InventoryItem] ?? null) as string | number | boolean | null
    const after = input[key]
    if (display(before) === display(after)) return []
    return [{ field, label: getImportField(field).label, from: display(before), to: display(after) }]
  })
}

function resolveOnHand(
  onHand: number | null,
  match: InventoryItem | null,
  options: PlanOptions,
): { onHand: number | null; change: FieldChange | null } {
  if (onHand === null) return { onHand: null, change: null }
  if (!match) return { onHand, change: null }
  if (!options.updateExistingStock || Math.abs(onHand - match.current_qty) < QUANTITY_EPSILON) {
    return { onHand: null, change: null }
  }
  return {
    onHand,
    change: {
      field: 'on_hand',
      label: getImportField('on_hand').label,
      from: formatNumber(match.current_qty),
      to: formatNumber(onHand),
    },
  }
}

function planRow(
  row: ImportSourceRow,
  cells: Cells,
  ctx: PlanContext,
  claimed: Map<string, number>,
): PlannedRow {
  const issues: RowIssue[] = []
  const typedName = (cells.name ?? '').trim()
  const match = findExisting(cells, typedName, ctx)
  const name = typedName || match?.name || ''

  if (!name) issues.push(error('name', 'Add a name for this ingredient'))

  const identity = match ? `id:${match.id}` : name ? `name:${normalizeName(name)}` : null
  const firstRow = identity ? claimed.get(identity) : undefined
  if (firstRow !== undefined) {
    issues.push(error('name', `Same ingredient as row ${firstRow}. Only row ${firstRow} is imported.`))
  } else if (identity) {
    claimed.set(identity, row.rowNumber)
  }

  const values: RowValues = {
    name,
    sku: blankToNull(cells.sku),
    category: blankToNull(cells.category),
    unitCost: readNumber(cells, 'unit_cost', issues),
    reorderLevel: readNumber(cells, 'reorder_level', issues),
    onHand: readNumber(cells, 'on_hand', issues),
    isPrep: readYesNo(cells, 'is_prep', issues),
    isActive: readYesNo(cells, 'is_active', issues),
  }
  const unit = readUnit(cells, match, ctx, issues)
  const base = { rowNumber: row.rowNumber, name, existingId: match?.id ?? null, issues }

  if (issues.some((issue) => issue.severity === 'error') || !unit.unitId) {
    return { ...base, status: 'error', input: null, onHand: null, changes: [], unresolvedUnitKey: unit.unresolvedKey }
  }

  const input = mergeInput(values, unit.unitId, match)
  const stock = resolveOnHand(values.onHand, match, ctx.options)
  if (!match) {
    return { ...base, status: 'create', input, onHand: stock.onHand, changes: [], unresolvedUnitKey: null }
  }

  const changes = [...diff(input, match), ...(stock.change ? [stock.change] : [])]
  return {
    ...base,
    status: changes.length > 0 ? 'update' : 'unchanged',
    input,
    onHand: stock.onHand,
    changes,
    unresolvedUnitKey: null,
  }
}

function collectUnresolvedUnits(rows: readonly PlannedRow[], sheet: ImportSheet, mapping: ColumnMapping): UnresolvedUnit[] {
  const unitColumn = mapping.indexOf('unit')
  const found = new Map<string, UnresolvedUnit>()

  for (const row of rows) {
    if (!row.unresolvedUnitKey) continue
    const current = found.get(row.unresolvedUnitKey)
    if (current) {
      found.set(row.unresolvedUnitKey, { ...current, rowCount: current.rowCount + 1 })
      continue
    }
    const source = sheet.rows.find((candidate) => candidate.rowNumber === row.rowNumber)
    const label = source?.cells[unitColumn]?.trim() || row.unresolvedUnitKey
    found.set(row.unresolvedUnitKey, { key: row.unresolvedUnitKey, label, rowCount: 1 })
  }
  return [...found.values()]
}

export function buildImportPlan(
  sheet: ImportSheet,
  mapping: ColumnMapping,
  ingredients: readonly InventoryItem[],
  units: readonly ImportUnit[],
  options: PlanOptions,
): ImportPlan {
  const ctx: PlanContext = {
    units,
    options,
    bySku: new Map(
      ingredients.filter((item) => item.sku?.trim()).map((item) => [item.sku!.trim().toLowerCase(), item]),
    ),
    byName: new Map(ingredients.map((item) => [normalizeName(item.name), item])),
  }
  const claimed = new Map<string, number>()
  const rows = sheet.rows.map((row) => planRow(row, readCells(row, mapping), ctx, claimed))

  const summary = { create: 0, update: 0, unchanged: 0, error: 0, total: rows.length }
  for (const row of rows) summary[row.status] += 1

  return { rows, summary, unresolvedUnits: collectUnresolvedUnits(rows, sheet, mapping) }
}

/** The rows that change something, in batches the server takes one at a time. */
export function toImportBatches(plan: ImportPlan, size: number): ImportRowPayload[][] {
  const payloads = plan.rows.flatMap((row) =>
    (row.status === 'create' || row.status === 'update') && row.input
      ? [{ rowNumber: row.rowNumber, existingId: row.existingId, input: row.input, onHand: row.onHand }]
      : [],
  )

  const batches: ImportRowPayload[][] = []
  for (let start = 0; start < payloads.length; start += size) {
    batches.push(payloads.slice(start, start + size))
  }
  return batches
}
