/**
 * One dish's recipes as the owner thinks of them: what each version uses.
 *
 * WHY THIS EXISTS (live platform, 2026-11-21, docs/plans/2026-11-21-dish-recipes-by-size.md):
 * the database stores a dish recipe plus, per choice, what that choice ADDS on
 * top (`order-depletion.ts`: option recipes add to the base, never replace it).
 * Owners think in totals ("a Large uses 250 ml milk"). 85% of dishes with sizes
 * and a recipe had no per-size recipe at all, and one store typed the whole
 * recipe into every flavour AND the dish, so each sale would take two cones.
 *
 * So the editor shows totals and this module converts:
 *
 *   stored  →  draft    every version's total = dish lines + that choice's lines
 *   draft   →  stored   the part every version shares stays in the dish recipe,
 *                       the rest goes to each choice (never negative)
 *
 * Storage and depletion do not change: base + choice = exactly what the owner
 * typed for every version. Pure, no DB, no React — mirrored by the app later.
 */

import { normalizeModifierGroups, type ModifierSource } from '@/lib/modifier-groups'
import { canConvertUnits, convertQuantity, type InventoryUnit } from '@/lib/inventory/unit-conversion'

/** The recipe target kinds a choice on a dish can be costed by. */
export type DishOptionTargetType = 'modifier_option' | 'variation_option' | 'addon'

export interface DishRecipeOption {
  id: string
  name: string
  /** Which `recipes.target_type` sales of this choice deplete through. */
  targetType: DishOptionTargetType
}

export interface DishRecipeGroup {
  id: string
  name: string
  /** Exactly one pick at most, never portions: sizes, sugar level, a flavour. */
  isPickOne: boolean
  /** The customer must pick one (`min_select >= 1`). */
  isRequired: boolean
  options: DishRecipeOption[]
}

/** One stored recipe line. */
export interface RecipeLine {
  inventoryItemId: string
  quantity: number
  unitId: string
}

/**
 * What the database holds for one dish: the dish recipe and every choice's
 * lines. `options` is keyed by option id; a choice with no recipe is absent or
 * an empty list.
 */
export interface DishRecipes {
  base: RecipeLine[]
  options: Record<string, RecipeLine[]>
}

/** The column key of the single "every order" column when nothing varies. */
export const EVERY_ORDER = ''

/** One ingredient of the table: its amount in each version. */
export interface DraftRow {
  key: string
  inventoryItemId: string
  unitId: string
  /** Column key → amount in `unitId`; null = blank = none in that version. */
  amounts: Record<string, number | null>
  /**
   * How much of this row the dish recipe held when it was loaded (in `unitId`).
   * Keeping that amount in the dish recipe on save means an unedited row saves
   * back exactly as it was, so a save never shuffles stock between targets.
   * Absent for rows the owner added: their shared part moves into the dish.
   */
  baseHint?: number
}

/** One line a pick adds (choices outside the table). */
export interface DraftLine {
  key: string
  inventoryItemId: string
  unitId: string
  quantity: number | null
}

export interface DishRecipeDraft {
  /** The pick-one list whose versions the table shows, or null: one column. */
  byGroupId: string | null
  rows: DraftRow[]
  /** Option id → what each pick of it adds, for every choice outside the table. */
  picks: Record<string, DraftLine[]>
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/**
 * Every choice list on a dish, with the recipe target each choice sells
 * through. Same precedence as `normalizeModifierGroups` and the app's
 * `dishRecipeChoices`: a dish with `modifier_groups` sells THOSE option ids
 * (legacy columns beside them are mirrors); otherwise variation types (or the
 * flat sizes) are `variation_option` and legacy add-ons are `addon`.
 */
export function dishRecipeGroups(item: ModifierSource): DishRecipeGroup[] {
  const isUnified = Boolean(item.modifier_groups && item.modifier_groups.length > 0)
  return normalizeModifierGroups(item)
    .map((group): DishRecipeGroup => {
      const targetType: DishOptionTargetType = isUnified
        ? 'modifier_option'
        : group.id === 'legacy-addons'
          ? 'addon'
          : 'variation_option'
      return {
        id: group.id,
        name: group.name,
        isPickOne: group.selection_mode !== 'quantity' && group.max_select === 1,
        isRequired: group.min_select >= 1,
        options: group.options
          .filter((option) => typeof option.id === 'string' && option.id.trim().length > 0)
          .map((option) => ({ id: option.id, name: option.name, targetType })),
      }
    })
    .filter((group) => group.options.length > 0)
}

/** Every option on the dish, keyed by id. */
export function optionIndex(groups: readonly DishRecipeGroup[]): Map<string, DishRecipeOption> {
  const index = new Map<string, DishRecipeOption>()
  for (const group of groups) for (const option of group.options) index.set(option.id, option)
  return index
}

/** Pick-one lists the table can be built over: two versions or more. */
export function tableGroups(groups: readonly DishRecipeGroup[]): DishRecipeGroup[] {
  return groups.filter((group) => group.isPickOne && group.options.length >= 2)
}

// ---------------------------------------------------------------------------
// Numbers: recipe quantities are numeric(16,4), so work in ten-thousandths.
// ---------------------------------------------------------------------------

const SCALE = 10_000

/** Ten-thousandths, the precision the database stores. */
export function toTicks(value: number): number {
  return Math.round(value * SCALE)
}

export function fromTicks(ticks: number): number {
  return ticks / SCALE
}

/** A quantity rounded to what the database keeps. */
export function roundQuantity(value: number): number {
  return fromTicks(toTicks(value))
}

type UnitLookup = ReadonlyMap<string, InventoryUnit>

export function unitLookup(units: readonly InventoryUnit[]): UnitLookup {
  return new Map(units.map((unit) => [unit.id, unit]))
}

/** `quantity` of `fromId` expressed in `toId`, or null when they don't convert. */
export function convertBetween(
  quantity: number,
  fromId: string,
  toId: string,
  units: UnitLookup,
): number | null {
  if (fromId === toId) return quantity
  const from = units.get(fromId)
  const to = units.get(toId)
  if (!from || !to || !canConvertUnits(from, to)) return null
  return convertQuantity(quantity, from, to)
}

// ---------------------------------------------------------------------------
// stored → draft
// ---------------------------------------------------------------------------

let keySeed = 0
/** A key for a row or line that stays put while the owner edits. */
export function newKey(prefix: string): string {
  keySeed += 1
  return `${prefix}${keySeed.toString(36)}`
}

/** The table's column keys for a draft. */
export function draftColumns(draft: Pick<DishRecipeDraft, 'byGroupId'>, groups: readonly DishRecipeGroup[]): string[] {
  if (draft.byGroupId === null) return [EVERY_ORDER]
  const group = groups.find((candidate) => candidate.id === draft.byGroupId)
  return group ? group.options.map((option) => option.id) : [EVERY_ORDER]
}

/**
 * Which list the table opens on: the pick-one list whose choices already
 * carry the most recipes, or none.
 */
export function defaultByGroup(stored: DishRecipes, groups: readonly DishRecipeGroup[]): string | null {
  let best: { id: string; count: number } | null = null
  for (const group of tableGroups(groups)) {
    const count = group.options.filter((option) => (stored.options[option.id] ?? []).length > 0).length
    if (count > 0 && (!best || count > best.count)) best = { id: group.id, count }
  }
  return best?.id ?? null
}

function blankAmounts(columns: readonly string[]): Record<string, number | null> {
  return Object.fromEntries(columns.map((column) => [column, null]))
}

function addToAmount(current: number | null | undefined, quantity: number): number | null {
  const sum = roundQuantity((current ?? 0) + quantity)
  return sum === 0 ? null : sum
}

/**
 * The editor's view of what is stored, with the table over `byGroupId`.
 *
 * Lines of the same ingredient merge into one row when their units convert
 * (the row keeps the first unit it met); a line that can't convert gets its
 * own row, so nothing stored is ever dropped.
 */
export function toDraft(
  stored: DishRecipes,
  groups: readonly DishRecipeGroup[],
  byGroupId: string | null,
  units: readonly InventoryUnit[],
): DishRecipeDraft {
  const lookup = unitLookup(units)
  const group = byGroupId === null ? null : tableGroups(groups).find((candidate) => candidate.id === byGroupId) ?? null
  const columns = group ? group.options.map((option) => option.id) : [EVERY_ORDER]
  const rows: DraftRow[] = []

  const rowFor = (line: RecipeLine): { row: DraftRow; quantity: number } => {
    for (const row of rows) {
      if (row.inventoryItemId !== line.inventoryItemId) continue
      const quantity = convertBetween(line.quantity, line.unitId, row.unitId, lookup)
      if (quantity !== null) return { row, quantity }
    }
    const row: DraftRow = {
      key: newKey('row-'),
      inventoryItemId: line.inventoryItemId,
      unitId: line.unitId,
      amounts: blankAmounts(columns),
      baseHint: 0,
    }
    rows.push(row)
    return { row, quantity: line.quantity }
  }

  for (const line of stored.base) {
    const { row, quantity } = rowFor(line)
    row.baseHint = roundQuantity((row.baseHint ?? 0) + quantity)
    for (const column of columns) row.amounts[column] = addToAmount(row.amounts[column], quantity)
  }

  if (group) {
    for (const option of group.options) {
      for (const line of stored.options[option.id] ?? []) {
        const { row, quantity } = rowFor(line)
        row.amounts[option.id] = addToAmount(row.amounts[option.id], quantity)
      }
    }
  }

  const tableOptionIds = new Set(group ? group.options.map((option) => option.id) : [])
  const picks: Record<string, DraftLine[]> = {}
  for (const option of optionIndex(groups).values()) {
    if (tableOptionIds.has(option.id)) continue
    picks[option.id] = (stored.options[option.id] ?? []).map((line) => ({
      key: newKey('pick-'),
      inventoryItemId: line.inventoryItemId,
      unitId: line.unitId,
      quantity: line.quantity,
    }))
  }

  return { byGroupId: group ? group.id : null, rows, picks }
}

// ---------------------------------------------------------------------------
// draft → stored
// ---------------------------------------------------------------------------

/**
 * What the draft means for the database.
 *
 * Per row: the shared part (the smallest amount across the versions, but no
 * more than the dish recipe already held for a loaded row) stays in the dish
 * recipe; each version keeps the rest. Totals are computed in ten-thousandths,
 * so dish + choice equals the typed amount exactly. Every option on the dish
 * gets an entry (an empty list = no recipe), so a save can clear one.
 */
export function toStored(draft: DishRecipeDraft, groups: readonly DishRecipeGroup[]): DishRecipes {
  const columns = draftColumns(draft, groups)
  const base: RecipeLine[] = []
  const options: Record<string, RecipeLine[]> = {}
  for (const option of optionIndex(groups).values()) options[option.id] = []

  for (const row of draft.rows) {
    const ticks = columns.map((column) => Math.max(0, toTicks(row.amounts[column] ?? 0)))
    let shared = Math.min(...ticks)
    if (row.baseHint !== undefined) shared = Math.min(shared, Math.max(0, toTicks(row.baseHint)))
    if (shared > 0) {
      base.push({ inventoryItemId: row.inventoryItemId, quantity: fromTicks(shared), unitId: row.unitId })
    }
    if (draft.byGroupId === null) continue
    columns.forEach((column, index) => {
      const rest = ticks[index] - shared
      if (rest > 0 && options[column]) {
        options[column].push({ inventoryItemId: row.inventoryItemId, quantity: fromTicks(rest), unitId: row.unitId })
      }
    })
  }

  const tableColumns = new Set(draft.byGroupId === null ? [] : columns)
  for (const [optionId, lines] of Object.entries(draft.picks)) {
    if (tableColumns.has(optionId) || !options[optionId]) continue
    for (const line of lines) {
      const ticks = toTicks(line.quantity ?? 0)
      if (ticks > 0) {
        options[optionId].push({ inventoryItemId: line.inventoryItemId, quantity: fromTicks(ticks), unitId: line.unitId })
      }
    }
  }

  return { base, options }
}

/**
 * Re-centre the table on another list (or on none). Goes through the stored
 * form, so nothing the owner typed is lost: a version that differs moves into
 * that choice's "each pick adds" lines and back.
 */
export function setByGroup(
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
  byGroupId: string | null,
  units: readonly InventoryUnit[],
): DishRecipeDraft {
  const next = toDraft(toStored(draft, groups), groups, byGroupId, units)
  // Rows the owner added keep "no hint": their shared part still belongs in the dish.
  const added = new Set(draft.rows.filter((row) => row.baseHint === undefined).map((row) => row.inventoryItemId))
  return {
    ...next,
    rows: next.rows.map((row) => (added.has(row.inventoryItemId) ? { ...row, baseHint: undefined } : row)),
  }
}

// ---------------------------------------------------------------------------
// Edits (all immutable)
// ---------------------------------------------------------------------------

function cleanAmount(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null
  return roundQuantity(value)
}

export function setRowAmount(draft: DishRecipeDraft, rowKey: string, column: string, value: number | null): DishRecipeDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      row.key === rowKey ? { ...row, amounts: { ...row.amounts, [column]: cleanAmount(value) } } : row,
    ),
  }
}

/** "Same for all": every version of this row gets `value`. */
export function fillRow(
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
  rowKey: string,
  value: number | null,
): DishRecipeDraft {
  const amount = cleanAmount(value)
  const columns = draftColumns(draft, groups)
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      row.key === rowKey ? { ...row, amounts: Object.fromEntries(columns.map((column) => [column, amount])) } : row,
    ),
  }
}

/** A new ingredient in the table; every version starts at `amount` (blank when null). */
export function addRow(
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
  inventoryItemId: string,
  unitId: string,
  amount: number | null = null,
): DishRecipeDraft {
  const value = cleanAmount(amount)
  const columns = draftColumns(draft, groups)
  const row: DraftRow = {
    key: newKey('row-'),
    inventoryItemId,
    unitId,
    amounts: Object.fromEntries(columns.map((column) => [column, value])),
  }
  return { ...draft, rows: [...draft.rows, row] }
}

export function removeRow(draft: DishRecipeDraft, rowKey: string): DishRecipeDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.key !== rowKey) }
}

/** The unit a row is measured in. Amounts keep their numbers: the owner is relabelling. */
export function setRowUnit(draft: DishRecipeDraft, rowKey: string, unitId: string): DishRecipeDraft {
  return { ...draft, rows: draft.rows.map((row) => (row.key === rowKey ? { ...row, unitId } : row)) }
}

export function addPickLine(
  draft: DishRecipeDraft,
  optionId: string,
  inventoryItemId: string,
  unitId: string,
  quantity: number | null = null,
): DishRecipeDraft {
  const line: DraftLine = { key: newKey('pick-'), inventoryItemId, unitId, quantity: cleanAmount(quantity) }
  return { ...draft, picks: { ...draft.picks, [optionId]: [...(draft.picks[optionId] ?? []), line] } }
}

export function updatePickLine(
  draft: DishRecipeDraft,
  optionId: string,
  lineKey: string,
  patch: Partial<Pick<DraftLine, 'quantity' | 'unitId'>>,
): DishRecipeDraft {
  const lines = (draft.picks[optionId] ?? []).map((line) =>
    line.key === lineKey
      ? { ...line, ...patch, ...(patch.quantity !== undefined ? { quantity: cleanAmount(patch.quantity) } : {}) }
      : line,
  )
  return { ...draft, picks: { ...draft.picks, [optionId]: lines } }
}

export function removePickLine(draft: DishRecipeDraft, optionId: string, lineKey: string): DishRecipeDraft {
  return {
    ...draft,
    picks: { ...draft.picks, [optionId]: (draft.picks[optionId] ?? []).filter((line) => line.key !== lineKey) },
  }
}

/** "Copy to…": these choices get the same lines as `fromOptionId` (replacing theirs). */
export function copyPicks(draft: DishRecipeDraft, fromOptionId: string, toOptionIds: readonly string[]): DishRecipeDraft {
  const source = draft.picks[fromOptionId] ?? []
  const picks = { ...draft.picks }
  for (const optionId of toOptionIds) {
    if (optionId === fromOptionId || !(optionId in picks)) continue
    picks[optionId] = source.map((line) => ({ ...line, key: newKey('pick-') }))
  }
  return { ...draft, picks }
}

// ---------------------------------------------------------------------------
// Reading the draft back
// ---------------------------------------------------------------------------

/** What one version (a table column) takes per sale, before any add-on picks. */
export interface VersionTotal {
  column: string
  lines: RecipeLine[]
}

export function versionTotals(draft: DishRecipeDraft, groups: readonly DishRecipeGroup[]): VersionTotal[] {
  return draftColumns(draft, groups).map((column) => ({
    column,
    lines: draft.rows.flatMap((row) => {
      const amount = row.amounts[column]
      return amount && amount > 0 ? [{ inventoryItemId: row.inventoryItemId, quantity: amount, unitId: row.unitId }] : []
    }),
  }))
}

/** Lines of one stored recipe in a stable order, for comparing two saves. */
function canonicalLines(lines: readonly RecipeLine[]): string {
  return lines
    .map((line) => `${line.inventoryItemId}|${line.unitId}|${toTicks(line.quantity)}`)
    .sort()
    .join(',')
}

/** A target to write: the dish recipe (`optionId` null) or one choice. */
export interface DishRecipeChange {
  optionId: string | null
  lines: RecipeLine[]
}

/**
 * The targets whose lines differ between two stored forms: what a save must
 * write. An option missing from `next` is left alone.
 */
export function changedTargets(previous: DishRecipes, next: DishRecipes): DishRecipeChange[] {
  const changes: DishRecipeChange[] = []
  if (canonicalLines(previous.base) !== canonicalLines(next.base)) changes.push({ optionId: null, lines: next.base })
  for (const [optionId, lines] of Object.entries(next.options)) {
    if (canonicalLines(previous.options[optionId] ?? []) !== canonicalLines(lines)) changes.push({ optionId, lines })
  }
  return changes
}

/** Whether the owner has changed anything worth saving. */
export function isDraftDirty(
  loaded: DishRecipes,
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
): boolean {
  return changedTargets(loaded, toStored(draft, groups)).length > 0
}
