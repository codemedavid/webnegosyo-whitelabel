/**
 * The export engine's vocabulary (plan docs/plans/2026-11-14-export-center-and-owl-reports.md §4).
 *
 * A SHEET is one table a person can download: a fixed list of columns and one
 * row per "thing" (an order, a dish, a day). The Export page, the Export
 * button on each report and Owl all ask for sheets by id, so a file is the
 * same whichever door made it.
 */

import type { StaffPermissionKey } from '@/lib/staff-permissions'

/** How a column's cells are written: pesos get two decimals, counts none, text is formula-guarded. */
export type ExportCellKind = 'text' | 'money' | 'count' | 'number' | 'percent'

/** A cell whose kind differs from its column's (the Summary sheet mixes pesos and counts). */
export interface TypedCell {
  value: number | null
  kind: ExportCellKind
}

/** Money is in PESOS here (centavos ÷ 100), percent is a ratio (0.25 = 25%). Blank = null, never 0. */
export type ExportCell = string | number | null | TypedCell

export interface ExportColumn {
  /** Stored in saved formats and Owl specs: never rename. */
  id: string
  header: string
  kind: ExportCellKind
  /** The staff key a caller needs to get this column at all. Without it the column is ABSENT, not blank. */
  needs?: StaffPermissionKey
}

export type ExportRow = Readonly<Record<string, ExportCell>>

/** One built sheet: only the columns the caller may see, rows already projected onto them. */
export interface BuiltSheet {
  id: string
  name: string
  columns: readonly ExportColumn[]
  rows: readonly (readonly ExportCell[])[]
  /** Plain sentences printed above the table and shown in the preview ("Stock is not set up"). */
  notes: readonly string[]
}

export interface ExportHeader {
  storeName: string
  /** "Nov 1 – 14, 2026" */
  periodLabel: string
  /** "All branches", a branch name, "Unassigned orders". */
  branchLabel: string
  /** Manila wall clock, "2026-11-14 15:02". Orders change after the fact, so every file says when it was read. */
  asOf: string
}

export type ExportFormat = 'xlsx' | 'csv'

export interface ExportFile {
  /** With its extension. */
  name: string
  contentType: string
  bytes: Uint8Array
}

/** Who is asking, reduced to what the catalogue needs. */
export interface ExportAccess {
  has: (key: StaffPermissionKey) => boolean
}
