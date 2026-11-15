/**
 * A report in the owner's own format (plan §6.3): their tabs, their column
 * order, their headings. Each tab is filled from ONE catalogue sheet ("one
 * row is a day / a dish / an order"); each of the owner's columns either
 * names a column of that sheet or stays blank, because the store has no
 * figure for it ("Upa", "Kuryente"). Like a custom report, a format is a
 * SHAPE and never carries a figure: the engine reads each sheet as the
 * caller and this module only orders, cuts and renames what came back.
 *
 * Pure and browser-safe.
 */

import { z } from 'zod'
import { EXPORT_SHEETS, SHEET_IDS, type SheetId } from './catalogue'
import { columnIdSchema, plainWords, tabTitleSchema } from './custom-report'
import { ExportError } from './errors'
import type { BuiltSheet, ExportCell, ExportColumn } from './types'

export const MAX_FORMAT_TABS = 4
export const MAX_FORMAT_COLUMNS = 25
export const MAX_FORMAT_HEADER = 60
export const MAX_FORMAT_TOP = 1000

const formatTabSchema = z
  .object({
    title: tabTitleSchema,
    sheet: z.enum(SHEET_IDS),
    /** The owner's columns, left to right. `id: null` = the store has no figure for it: the column is kept and left blank. */
    columns: z
      .array(z.object({ header: plainWords(MAX_FORMAT_HEADER), id: columnIdSchema.nullable() }).strict())
      .min(1)
      .max(MAX_FORMAT_COLUMNS)
      .refine((columns) => columns.some((column) => column.id !== null), 'a tab needs at least one column the store can fill'),
    sort: z.object({ column: columnIdSchema, descending: z.boolean().default(false) }).strict().nullable().default(null),
    top: z.number().int().min(1).max(MAX_FORMAT_TOP).nullable().default(null),
  })
  .strict()

export const reportFormatSpecSchema = z
  .object({
    tabs: z
      .array(formatTabSchema)
      .min(1)
      .max(MAX_FORMAT_TABS)
      .refine((tabs) => new Set(tabs.map((tab) => tab.title.toLowerCase())).size === tabs.length, 'two tabs share a name'),
  })
  .strict()

export type ReportFormatSpec = z.infer<typeof reportFormatSpecSchema>
export type ReportFormatTab = ReportFormatSpec['tabs'][number]

/** The catalogue sheets a format reads, each once, in the order its tabs first use them. */
export function formatSheets(spec: ReportFormatSpec): SheetId[] {
  return [...new Set(spec.tabs.map((tab) => tab.sheet))]
}

/** The owner's headings a tab leaves blank. */
export function blankHeaders(tab: ReportFormatTab): string[] {
  return tab.columns.filter((column) => column.id === null).map((column) => column.header)
}

export interface FormatColumnProblem {
  tab: string
  sheet: SheetId
  /** Column ids the tab names (filled or sorted by) that the sheet lacks. */
  unknown: string[]
  available: { id: string; header: string }[]
}

/** Every tab that names a column its sheet does not have among `columnsOf(sheet)`. */
export function formatColumnProblems(spec: ReportFormatSpec, columnsOf: (sheet: SheetId) => readonly ExportColumn[]): FormatColumnProblem[] {
  return spec.tabs.flatMap((tab) => {
    const columns = columnsOf(tab.sheet)
    const known = new Set(columns.map((column) => column.id))
    const named = [...tab.columns.flatMap((column) => (column.id === null ? [] : [column.id])), ...(tab.sort ? [tab.sort.column] : [])]
    const unknown = [...new Set(named.filter((id) => !known.has(id)))]
    return unknown.length === 0 ? [] : [{ tab: tab.title, sheet: tab.sheet, unknown, available: columns.map((column) => ({ id: column.id, header: column.header })) }]
  })
}

function plain(cell: ExportCell): string | number | null {
  if (cell === null) return null
  return typeof cell === 'object' ? cell.value : cell
}

/** Blanks last whichever way the column runs; numbers by size, words by the alphabet. */
function order(a: ExportCell, b: ExportCell, descending: boolean): number {
  const left = plain(a)
  const right = plain(b)
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' })
  return descending ? -result : result
}

/**
 * One tab as the owner laid it out: their headings in their order, filled
 * from the sheet where a column was matched and blank where it was not.
 * Refuses a column the sheet does not have for this caller (a cost column
 * without the costs key is ABSENT, so a format cannot ask for it back).
 */
export function applyFormatTab(built: BuiltSheet, tab: ReportFormatTab): BuiltSheet {
  const at = new Map(built.columns.map((column, index) => [column.id, index]))
  const named = [...tab.columns.flatMap((column) => (column.id === null ? [] : [column.id])), ...(tab.sort ? [tab.sort.column] : [])]
  const unknown = [...new Set(named.filter((id) => !at.has(id)))]
  if (unknown.length > 0) {
    throw new ExportError(`The “${tab.title}” tab uses ${unknown.map((id) => `"${id}"`).join(', ')}, which ${built.name} does not have for this account.`, 400)
  }
  const position = (id: string): number => at.get(id) ?? -1

  let rows = built.rows
  if (tab.sort) {
    const index = position(tab.sort.column)
    const { descending } = tab.sort
    // Array sort is stable: rows that tie keep the sheet's own order.
    rows = [...rows].sort((a, b) => order(a[index], b[index], descending))
  }
  const matched = rows.length
  if (tab.top !== null) rows = rows.slice(0, tab.top)

  const blanks = blankHeaders(tab)
  const shaped: string[] = [`Made from the ${built.name} sheet, in your format.`]
  if (blanks.length > 0) shaped.push(`Left blank (the store has no figure for it): ${blanks.join(', ')}.`)
  if (tab.sort) shaped.push(`Sorted by ${built.columns[position(tab.sort.column)].header}, ${tab.sort.descending ? 'highest first' : 'lowest first'}.`)
  if (tab.top !== null && matched > rows.length) shaped.push(`The first ${rows.length} of ${matched} rows.`)

  return {
    id: built.id,
    name: tab.title,
    columns: tab.columns.map((column, index): ExportColumn =>
      column.id === null ? { id: `blank_${index + 1}`, header: column.header, kind: 'text' } : { ...built.columns[position(column.id)], header: column.header },
    ),
    rows: rows.map((row) => tab.columns.map((column) => (column.id === null ? null : row[position(column.id)]))),
    notes: [...shaped, ...built.notes],
  }
}

/** "2 tabs · Daily (Sales by day), Dishes (Items sold) · 3 columns left blank" */
export function formatSummary(spec: ReportFormatSpec): string {
  const tabs = spec.tabs.map((tab) => `${tab.title} (${EXPORT_SHEETS[tab.sheet].name})`).join(', ')
  const blanks = spec.tabs.reduce((sum, tab) => sum + blankHeaders(tab).length, 0)
  const parts = [`${spec.tabs.length} ${spec.tabs.length === 1 ? 'tab' : 'tabs'}`, tabs]
  if (blanks > 0) parts.push(`${blanks} ${blanks === 1 ? 'column' : 'columns'} left blank`)
  return parts.join(' · ')
}

/** The mapping in plain words, one line per column: "Benta → Sales", "Upa → left blank". */
export function formatMappingLines(spec: ReportFormatSpec): string[] {
  return spec.tabs.flatMap((tab) => {
    const sheet = EXPORT_SHEETS[tab.sheet]
    const header = (id: string): string => sheet.columns.find((column) => column.id === id)?.header ?? id
    return [
      `${tab.title}: one row is ${sheet.rowIs.split(':')[0]}.`,
      ...tab.columns.map((column) => (column.id === null ? `  ${column.header} → left blank (no figure for this)` : `  ${column.header} → ${header(column.id)}`)),
    ]
  })
}
