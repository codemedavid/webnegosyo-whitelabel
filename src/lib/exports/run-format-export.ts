/**
 * A report in the owner's own format, read and laid out: the engine reads
 * each sheet the format's tabs are made from ONCE, exactly as an ordinary
 * export would for this caller (same staff keys, same row caps, same
 * refusals), then `applyFormatTab` lays each tab out. A tab whose sheet this
 * account may not have is left out and named, like any other sheet; a file
 * with no tab left is refused by the engine. A preview does the same read,
 * so its counts and first rows are the file's.
 */

import { EXPORT_SHEETS } from './catalogue'
import { applyFormatTab, formatSheets, type ReportFormatSpec } from './report-format'
import { PEEK_ROWS, runExport, type ExportInput, type ExportPreview, type ExportResult } from './run-export'

export async function runFormatExport(input: ExportInput, spec: ReportFormatSpec, title?: string): Promise<ExportResult> {
  const result = await runExport({ ...input, sheets: formatSheets(spec) })
  const built = new Map(result.sheets.map((sheet) => [sheet.id, sheet]))
  return {
    ...result,
    ...(title ? { title } : {}),
    sheets: spec.tabs.flatMap((tab) => {
      const sheet = built.get(tab.sheet)
      return sheet ? [applyFormatTab(sheet, tab)] : []
    }),
    leftOut: result.leftOut.map((left) => {
      const tabs = spec.tabs.filter((tab) => tab.sheet === left.id).map((tab) => `“${tab.title}”`)
      return { ...left, note: `The ${tabs.join(' and ')} ${tabs.length === 1 ? 'tab was' : 'tabs were'} left out: ${left.note.replace(/^.* was left out: /, '')}` }
    }),
  }
}

export async function previewFormatExport(input: ExportInput, spec: ReportFormatSpec): Promise<ExportPreview> {
  const result = await runFormatExport(input, spec)
  const shown = spec.tabs.filter((tab) => result.sheets.some((sheet) => sheet.name === tab.title))
  return {
    header: result.header,
    leftOut: result.leftOut,
    sheets: result.sheets.map((sheet, index) => ({
      // Two tabs may be made from one sheet: the preview tells them apart.
      id: `${sheet.id}:${index + 1}`,
      name: sheet.name,
      rowIs: EXPORT_SHEETS[shown[index].sheet].rowIs,
      columns: sheet.columns.map((column) => column.header),
      kinds: sheet.columns.map((column) => column.kind),
      rows: sheet.rows.length,
      peek: sheet.rows.slice(0, PEEK_ROWS),
      notes: sheet.notes,
    })),
  }
}
