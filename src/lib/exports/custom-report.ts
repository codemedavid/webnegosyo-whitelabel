/**
 * A custom report (plan §6.2): ONE catalogue sheet, reshaped. A spec says
 * which sheet ("one row is a day / a dish / an order"), which of its columns
 * in what order and under what headings, which rows to keep, how to sort and
 * how many to keep. The spec never carries a figure: the engine reads the
 * sheet exactly as an ordinary export does (as the caller, with their staff
 * keys) and this module only filters, sorts, cuts and renames what came back.
 *
 * Pure and browser-safe (no Buffer, no database): Owl writes the spec, the
 * link carries it, the route applies it.
 */

import { z } from 'zod'
import { SHEET_IDS } from './catalogue'
import { ExportError } from './errors'
import type { BuiltSheet, ExportCell, ExportColumn } from './types'

export const MAX_CUSTOM_COLUMNS = 20
export const MAX_CUSTOM_FILTERS = 4
export const MAX_CUSTOM_TOP = 1000
/** The spec rides in a link: its encoded form stays under this. */
export const MAX_CUSTOM_PARAM_LENGTH = 2400

export const CUSTOM_FILTER_OPS = ['is', 'is_not', 'contains', 'at_least', 'at_most'] as const
export type CustomFilterOp = (typeof CUSTOM_FILTER_OPS)[number]

const columnId = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
/** Starts with a letter or digit (never `=`, `+`, `-`, `@`), no control characters. */
const plainWords = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[\p{L}\p{N}][^\u0000-\u001f\u007f]*$/u)

export const customReportSpecSchema = z
  .object({
    /** Also the Excel tab name: ≤ 31 characters, none of \ / ? * [ ] : */
    title: plainWords(31).regex(/^[^\\/?*[\]:]+$/),
    sheet: z.enum(SHEET_IDS),
    columns: z
      .array(z.object({ id: columnId, header: plainWords(40).optional() }).strict())
      .min(1)
      .max(MAX_CUSTOM_COLUMNS)
      .refine((columns) => new Set(columns.map((column) => column.id)).size === columns.length, 'a column is listed twice'),
    filters: z
      .array(z.object({ column: columnId, op: z.enum(CUSTOM_FILTER_OPS), value: z.union([z.string().trim().min(1).max(60), z.number().finite()]) }).strict())
      .max(MAX_CUSTOM_FILTERS)
      .default([]),
    sort: z.object({ column: columnId, descending: z.boolean().default(false) }).strict().nullable().default(null),
    top: z.number().int().min(1).max(MAX_CUSTOM_TOP).nullable().default(null),
  })
  .strict()

export type CustomReportSpec = z.infer<typeof customReportSpecSchema>

// ── The spec in a link ────────────────────────────────────────────────────

/** UTF-8 → base64url without TextEncoder or Buffer, so the same code runs in a browser, on the server and in the app. */
function toBase64Url(text: string): string {
  const binary = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  return decodeURIComponent(Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
}

export function encodeCustomSpec(spec: CustomReportSpec): string {
  return toBase64Url(JSON.stringify(spec))
}

/** The spec a link carries, checked again: a link is whatever someone typed. `null` = not a spec. */
export function decodeCustomSpec(encoded: string): CustomReportSpec | null {
  if (encoded.length === 0 || encoded.length > MAX_CUSTOM_PARAM_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const parsed = customReportSpecSchema.safeParse(JSON.parse(fromBase64Url(encoded)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// ── Applying it ───────────────────────────────────────────────────────────

/** A cell as the thing it holds: a number, words, or nothing. */
function plain(cell: ExportCell): string | number | null {
  if (cell === null) return null
  return typeof cell === 'object' ? cell.value : cell
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** A filter's number, when the value is one ("500", 500, "1,250.50"). */
function asNumber(value: string | number): number | null {
  if (typeof value === 'number') return value
  const cleaned = value.replace(/[₱,\s]/g, '')
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

/** <0, 0, >0 — numbers as numbers, anything else as folded words. `null` = cannot be compared. */
function compare(cell: ExportCell, value: string | number): number | null {
  const held = plain(cell)
  if (held === null) return null
  const wanted = asNumber(value)
  if (typeof held === 'number') return wanted === null ? null : held - wanted
  return fold(held).localeCompare(fold(String(value)), 'en', { numeric: true })
}

function keeps(cell: ExportCell, op: CustomFilterOp, value: string | number): boolean {
  if (op === 'contains') {
    const held = plain(cell)
    return held !== null && fold(String(held)).includes(fold(String(value)))
  }
  const order = compare(cell, value)
  switch (op) {
    case 'is':
      return order === 0
    case 'is_not':
      return order !== 0
    case 'at_least':
      return order !== null && order >= 0
    default:
      return order !== null && order <= 0
  }
}

/** Blanks last whichever way the column runs; numbers by size, words by the alphabet. */
function order(a: ExportCell, b: ExportCell, descending: boolean): number {
  const left = plain(a)
  const right = plain(b)
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  const result =
    typeof left === 'number' && typeof right === 'number' ? left - right : fold(String(left)).localeCompare(fold(String(right)), 'en', { numeric: true })
  return descending ? -result : result
}

const OP_WORDS: Readonly<Record<CustomFilterOp, string>> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  at_least: 'is at least',
  at_most: 'is at most',
}

export interface CustomColumnProblem {
  /** The ids the spec names that this sheet does not have for this account. */
  unknown: string[]
  /** What it may name instead. */
  available: { id: string; header: string }[]
}

/** Every column the spec names (shown, filtered on, sorted by) that the sheet lacks for this caller. */
export function customColumnProblem(spec: CustomReportSpec, columns: readonly ExportColumn[]): CustomColumnProblem | null {
  const known = new Set(columns.map((column) => column.id))
  const named = [...spec.columns.map((column) => column.id), ...spec.filters.map((filter) => filter.column), ...(spec.sort ? [spec.sort.column] : [])]
  const unknown = [...new Set(named.filter((id) => !known.has(id)))]
  return unknown.length === 0 ? null : { unknown, available: columns.map((column) => ({ id: column.id, header: column.header })) }
}

/**
 * The sheet as the spec wants it: rows kept, sorted and cut, then only the
 * chosen columns under their chosen headings. Refuses a column the sheet does
 * not have for this caller (a cost column without the costs key is ABSENT, so
 * a spec cannot ask for it back).
 */
export function applyCustomSpec(built: BuiltSheet, spec: CustomReportSpec): BuiltSheet {
  const problem = customColumnProblem(spec, built.columns)
  if (problem) {
    throw new ExportError(
      `${built.name} has no column called ${problem.unknown.map((id) => `"${id}"`).join(', ')} for this account. It has: ${problem.available.map((column) => column.id).join(', ')}.`,
      400,
    )
  }
  const at = new Map(built.columns.map((column, index) => [column.id, index]))
  const position = (id: string): number => at.get(id) ?? -1
  const header = (id: string): string => built.columns[position(id)].header

  let rows = built.rows.filter((row) => spec.filters.every((filter) => keeps(row[position(filter.column)], filter.op, filter.value)))
  if (spec.sort) {
    const { column, descending } = spec.sort
    const index = position(column)
    // Array sort is stable: rows that tie keep the sheet's own order.
    rows = [...rows].sort((a, b) => order(a[index], b[index], descending))
  }
  const matched = rows.length
  if (spec.top !== null) rows = rows.slice(0, spec.top)

  const shaped: string[] = [`Made from the ${built.name} sheet.`]
  for (const filter of spec.filters) shaped.push(`Only rows where ${header(filter.column)} ${OP_WORDS[filter.op]} ${filter.value}.`)
  if (spec.sort) shaped.push(`Sorted by ${header(spec.sort.column)}, ${spec.sort.descending ? 'highest first' : 'lowest first'}.`)
  if (spec.top !== null && matched > rows.length) shaped.push(`The first ${rows.length} of ${matched} rows.`)

  return {
    id: built.id,
    name: spec.title,
    columns: spec.columns.map((column) => ({ ...built.columns[position(column.id)], header: column.header ?? header(column.id) })),
    rows: rows.map((row) => spec.columns.map((column) => row[position(column.id)])),
    notes: [...shaped, ...built.notes],
  }
}
