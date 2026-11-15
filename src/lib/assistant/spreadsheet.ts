/**
 * The owner's own report format, attached to a message as a spreadsheet
 * (plan §6.3 "Follow my format").
 *
 * The file itself never leaves the browser. What travels is its OUTLINE: tab
 * names, the heading row of each tab and a few sample rows cut short, enough
 * for Owl to tell what each column is for. No formula, macro or link is
 * followed or kept, and nothing of it is stored: like menu photos, the
 * outline lives for ONE turn (`ctx.spreadsheet`) and the saved message keeps
 * only a marker with the file's name.
 *
 * Pure and browser-safe: the browser builds the outline, the server checks it
 * again with the same schema.
 */

import { z } from 'zod'
import type { StoredPart } from '@/lib/assistant/history'

/** Largest spreadsheet the browser will open for its outline. */
export const MAX_SHEET_FILE_BYTES = 2 * 1024 * 1024
/** Tabs and columns of a file that are read; a format holds no more (`report-format.ts`). */
export const MAX_OUTLINE_TABS = 4
export const MAX_OUTLINE_COLUMNS = 25
export const MAX_OUTLINE_SAMPLES = 3
export const MAX_OUTLINE_CELL = 40
export const MAX_OUTLINE_HEADING = 80
/** The whole outline as JSON, in characters. */
export const MAX_OUTLINE_CHARS = 20_000
/** Rows from the top of a tab searched for its heading row. */
const HEADING_SEARCH_ROWS = 15

/** How the browser hands the outline to the chat transport: a file part of this type. */
export const SHEET_MEDIA_TYPE = 'application/vnd.webnegosyo.sheet-outline+json'
/** What a spreadsheet-only message says, so the model knows what the owner wants. */
export const SHEET_ONLY_TEXT = 'Make my reports follow this format.'

const outlineTabSchema = z
  .object({
    name: z.string().max(MAX_OUTLINE_HEADING),
    /** The heading row, left to right; an empty cell is an empty string. */
    headers: z.array(z.string().max(MAX_OUTLINE_HEADING)).min(1).max(MAX_OUTLINE_COLUMNS),
    samples: z.array(z.array(z.string().max(MAX_OUTLINE_CELL)).max(MAX_OUTLINE_COLUMNS)).max(MAX_OUTLINE_SAMPLES),
    /** Filled rows under the heading row. */
    rows: z.number().int().min(0).max(10_000_000),
    /** Columns of the file past the ones read. */
    moreColumns: z.number().int().min(0).max(100_000).default(0),
  })
  .strict()

export const spreadsheetOutlineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    tabs: z.array(outlineTabSchema).min(1).max(MAX_OUTLINE_TABS),
    /** Tabs of the file past the ones read. */
    moreTabs: z.number().int().min(0).max(10_000).default(0),
  })
  .strict()

export type SpreadsheetOutline = z.infer<typeof spreadsheetOutlineSchema>
export type SpreadsheetOutlineTab = SpreadsheetOutline['tabs'][number]

/** A spreadsheet date as its day. Excel dates have no time zone: the reader hands them over as that day at 00:00 UTC, so the UTC parts ARE the day typed. */
function spreadsheetDay(value: Date): string {
  if (Number.isNaN(value.getTime())) return ''
  const two = (part: number): string => String(part).padStart(2, '0')
  return `${value.getUTCFullYear()}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())}`
}

/** One cell as short plain text. A formula gives its last result, a link its words; nothing is followed. */
export function cellText(value: unknown, max: number = MAX_OUTLINE_CELL): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return spreadsheetDay(value)
  if (typeof value === 'object') {
    const cell = value as { result?: unknown; text?: unknown; richText?: unknown; error?: unknown }
    if (Array.isArray(cell.richText)) return cellText(cell.richText.map((run: { text?: unknown }) => (typeof run?.text === 'string' ? run.text : '')).join(''), max)
    if (cell.text !== undefined) return cellText(cell.text, max)
    if (cell.result !== undefined) return cellText(cell.result, max)
    return ''
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : ''
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  // Control characters out, runs of space folded: a cell is one short line.
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function isNumberLike(text: string): boolean {
  return /^[₱$]?\s*-?[\d,]*\.?\d+%?$/.test(text)
}

/** The heading row: the first row near the top with two or more filled cells, most of them words. */
function headingRowIndex(rows: readonly string[][]): number {
  const near = rows.slice(0, HEADING_SEARCH_ROWS)
  const wordy = near.findIndex((row) => {
    const filled = row.filter((cell) => cell !== '')
    return filled.length >= 2 && filled.filter((cell) => !isNumberLike(cell)).length * 2 >= filled.length
  })
  if (wordy !== -1) return wordy
  return near.findIndex((row) => row.some((cell) => cell !== ''))
}

/** One tab's outline from its raw cells, or null when the tab holds nothing. */
export function outlineTab(name: string, grid: readonly (readonly unknown[])[]): SpreadsheetOutlineTab | null {
  const rows = grid.map((row) => row.map((cell) => cellText(cell)))
  const at = headingRowIndex(rows)
  if (at === -1) return null
  const heading = rows[at]
  const first = heading.findIndex((cell) => cell !== '')
  const last = heading.reduce((found, cell, index) => (cell !== '' ? index : found), first)
  const width = last - first + 1
  const cut = (row: readonly string[]): string[] => Array.from({ length: Math.min(width, MAX_OUTLINE_COLUMNS) }, (_, index) => row[first + index] ?? '')
  const filled = rows.slice(at + 1).filter((row) => row.slice(first, last + 1).some((cell) => cell !== ''))
  return {
    name: cellText(name, MAX_OUTLINE_HEADING),
    headers: cut(grid[at].map((cell) => cellText(cell, MAX_OUTLINE_HEADING))),
    samples: filled.slice(0, MAX_OUTLINE_SAMPLES).map(cut),
    rows: filled.length,
    moreColumns: Math.max(0, width - MAX_OUTLINE_COLUMNS),
  }
}

export interface RawSheet {
  name: string
  grid: readonly (readonly unknown[])[]
}

/** The outline of a whole file, or null when no tab holds anything. Empty tabs are skipped. */
export function outlineFromSheets(fileName: string, sheets: readonly RawSheet[]): SpreadsheetOutline | null {
  const tabs = sheets.flatMap((sheet) => {
    const tab = outlineTab(sheet.name, sheet.grid)
    return tab ? [tab] : []
  })
  if (tabs.length === 0) return null
  return {
    name: cellText(fileName, 120) || 'Spreadsheet',
    tabs: tabs.slice(0, MAX_OUTLINE_TABS),
    moreTabs: Math.max(0, tabs.length - MAX_OUTLINE_TABS),
  }
}

export type SheetCheck = { ok: true; sheet: SpreadsheetOutline | null } | { ok: false; error: string }

/** The outline a message carried, checked again on the server: a request is whatever someone sent. */
export function checkMessageSheet(raw: unknown): SheetCheck {
  if (raw === undefined || raw === null) return { ok: true, sheet: null }
  let size: number
  try {
    size = JSON.stringify(raw).length
  } catch {
    return { ok: false, error: 'That spreadsheet could not be read.' }
  }
  if (size > MAX_OUTLINE_CHARS) return { ok: false, error: 'That spreadsheet has too much in its headings to read. Try a simpler copy of it.' }
  const parsed = spreadsheetOutlineSchema.safeParse(raw)
  return parsed.success ? { ok: true, sheet: parsed.data } : { ok: false, error: 'That spreadsheet could not be read.' }
}

/** A file name that is safe to print in the instructions: letters, digits and a few marks only. */
export function safeFileLabel(name: string): string {
  return (
    name
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N} ._()-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'spreadsheet'
  )
}

/** What is stored in place of the outline: the file's name and how many tabs were read. */
export function sheetMarkerPart(sheet: SpreadsheetOutline): StoredPart {
  return { type: 'data-sheet', data: { name: safeFileLabel(sheet.name), tabs: sheet.tabs.length } }
}

/** The outline as the data URL of a chat file part, and back. */
export function sheetToDataUrl(sheet: SpreadsheetOutline): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify(sheet))}`
}

export function sheetFromDataUrl(url: string): unknown {
  const prefix = 'data:application/json,'
  if (!url.startsWith(prefix)) return null
  try {
    return JSON.parse(decodeURIComponent(url.slice(prefix.length)))
  } catch {
    return null
  }
}
