/**
 * A custom report, read and reshaped: the engine reads the spec's ONE sheet
 * whole, exactly as an ordinary export would for this caller (same staff
 * keys, same row caps, same refusals), then `applyCustomSpec` filters, sorts,
 * cuts and renames it. A preview does the same read, so its count and first
 * rows are the file's.
 */

import { EXPORT_SHEETS } from './catalogue'
import { applyCustomSpec, type CustomReportSpec } from './custom-report'
import { PEEK_ROWS, runExport, type ExportInput, type ExportPreview, type ExportResult } from './run-export'

export async function runCustomExport(input: ExportInput, spec: CustomReportSpec): Promise<ExportResult> {
  // A sheet this account may not have is refused by the engine (403) before anything is shaped.
  const result = await runExport({ ...input, sheets: [spec.sheet] })
  return { ...result, sheets: result.sheets.map((sheet) => applyCustomSpec(sheet, spec)) }
}

export async function previewCustomExport(input: ExportInput, spec: CustomReportSpec): Promise<ExportPreview> {
  const result = await runCustomExport(input, spec)
  return {
    header: result.header,
    leftOut: result.leftOut,
    sheets: result.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      rowIs: EXPORT_SHEETS[spec.sheet].rowIs,
      columns: sheet.columns.map((column) => column.header),
      kinds: sheet.columns.map((column) => column.kind),
      rows: sheet.rows.length,
      peek: sheet.rows.slice(0, PEEK_ROWS),
      notes: sheet.notes,
    })),
  }
}
