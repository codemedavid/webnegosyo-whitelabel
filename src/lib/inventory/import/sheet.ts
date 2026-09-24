/**
 * A raw grid of cells → a header row and numbered data rows.
 *
 * Rows keep the number the merchant sees in Excel (header = its own row, first
 * data row usually 2), because every problem on the review screen is reported
 * as "row 14" and they will go looking for row 14 in their file.
 */

import { cellToText } from '@/lib/inventory/import/value-parsing'

/**
 * One import carries at most this many rows. Far above any single store's
 * pantry; it exists so a wrong file (a year of sales) fails at once with a
 * sentence rather than freezing the tab.
 */
export const MAX_IMPORT_ROWS = 2000

export interface ImportSourceRow {
  /** 1-based, as the spreadsheet numbers it. */
  rowNumber: number
  cells: string[]
}

export interface ImportSheet {
  headers: string[]
  rows: ImportSourceRow[]
}

const isBlankRow = (cells: readonly string[]) => cells.every((cell) => cell === '')

export function toImportSheet(grid: readonly (readonly unknown[])[]): ImportSheet {
  const cleaned = grid.map((row) => row.map(cellToText))
  const headerIndex = cleaned.findIndex((row) => !isBlankRow(row))
  if (headerIndex === -1) return { headers: [], rows: [] }

  const body = cleaned
    .slice(headerIndex + 1)
    .map((cells, offset) => ({ rowNumber: headerIndex + offset + 2, cells }))
    .filter((row) => !isBlankRow(row.cells))

  const width = Math.max(cleaned[headerIndex].length, ...body.map((row) => row.cells.length))
  const pad = (cells: readonly string[]) =>
    Array.from({ length: width }, (_, index) => cells[index] ?? '')

  return {
    headers: pad(cleaned[headerIndex]),
    rows: body.map((row) => ({ rowNumber: row.rowNumber, cells: pad(row.cells) })),
  }
}
