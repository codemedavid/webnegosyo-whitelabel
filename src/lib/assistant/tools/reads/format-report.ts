/**
 * What Owl answers with after a report was laid out in the owner's own
 * format (`report-format.ts`): the tabs and their row counts on a file card,
 * and for the model only what it may read back.
 *
 * Two callers. `run_saved_report` ran a format the store keeps: the card
 * downloads it by its id. `follow_report_format` has just matched an uploaded
 * layout: nothing is stored yet, the shape is too long for a link, so the
 * card carries the shape for the owner's Save tap and offers the file after.
 */

import type { ToolResult } from '@/lib/assistant/types'
import type { SheetId } from '@/lib/exports/catalogue'
import { blankHeaders, formatMappingLines, formatSheets, type ReportFormatSpec } from '@/lib/exports/report-format'
import { exportHref, type ExportRequest } from '@/lib/exports/request-schema'
import type { ExportResult } from '@/lib/exports/run-export'
import { SHEETS_OWL_MAY_READ, firstRows } from './custom-report'

const ROWS_FOR_MODEL = 6
/** The mapping is printed on the card one line per column: a wide layout is cut with a count. */
const MAX_MAPPING_LINES = 30

export type FormatReportTarget = { savedAs: { id: string; name: string } } | { saveAs: string; period: { from: string; to: string } }

export function buildFormatReportResult(
  result: ExportResult,
  spec: ReportFormatSpec,
  request: Pick<ExportRequest, 'tenantId' | 'period' | 'branch' | 'format'>,
  exportPagePath: string,
  target: FormatReportTarget,
): ToolResult {
  const isSaved = 'savedAs' in target
  const name = isSaved ? target.savedAs.name : target.saveAs
  const sheets = formatSheets(spec)
  // The tabs that made it into the file, each beside the tab of the format it was laid out from.
  const tabs = result.sheets.flatMap((sheet) => {
    const tab = spec.tabs.find((entry) => entry.title === sheet.name)
    return tab ? [{ sheet, tab }] : []
  })
  const readable = tabs.find(({ tab }) => SHEETS_OWL_MAY_READ.has(tab.sheet as SheetId))
  const leftBlank = spec.tabs.flatMap((tab) => blankHeaders(tab))
  const mapping = formatMappingLines(spec)
  const other = request.format === 'xlsx' ? 'csv' : 'xlsx'
  const link = (format: 'xlsx' | 'csv') => exportHref({ ...request, sheets, format, source: 'owl', template: isSaved ? target.savedAs.id : null })
  const notes = [
    ...result.leftOut.map((left) => left.note),
    ...(isSaved
      ? leftBlank.length > 0
        ? [`Left blank (the store has no figure for it): ${leftBlank.join(', ')}.`]
        : []
      : mapping.length > MAX_MAPPING_LINES
        ? [...mapping.slice(0, MAX_MAPPING_LINES), `…and ${mapping.length - MAX_MAPPING_LINES} more columns.`]
        : mapping),
  ]
  return {
    facts: {
      ready: true,
      title: name,
      period: result.header.periodLabel,
      branch: result.header.branchLabel,
      tabs: tabs.map(({ sheet }) => ({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.map((column) => column.header) })),
      ...(leftBlank.length > 0 ? { leftBlank } : {}),
      ...(result.leftOut.length > 0 ? { leftOut: result.leftOut.map((left) => left.note) } : {}),
      ...(readable ? { firstRowsOf: readable.sheet.name, firstRows: firstRows(readable.sheet).slice(0, ROWS_FOR_MODEL), moneyIsPesos: true } : {}),
      say: isSaved
        ? 'The file is on the card. You may quote firstRows if given (percent columns are ratios: 0.25 = 25%); say nothing about rows you were not given.'
        : 'Nothing is saved yet and there is no file yet. Tell the owner, in a few plain words, how you matched their columns and which ones stay blank, then ask them to check the card and tap "Save this format": the file can be downloaded right after, and made again for any dates. You cannot save it for them.',
    },
    card: {
      type: 'file',
      title: name,
      subtitle: `${result.header.periodLabel} · ${result.header.branchLabel}`,
      sheets: tabs.map(({ sheet }) => ({ name: sheet.name, rows: sheet.rows.length })),
      notes,
      downloads: isSaved
        ? [
            { label: request.format === 'xlsx' ? 'Download Excel' : 'Download CSV', href: link(request.format) },
            { label: other === 'xlsx' ? 'Excel' : 'CSV', href: link(other) },
          ]
        : [],
      ...(isSaved ? {} : { save: { tenantId: request.tenantId, name, kind: 'format' as const, spec, sheets, period: target.period } }),
    },
    chips: isSaved
      ? [{ label: 'Same for last month', prompt: `Make my saved format "${name}" for last month.` }]
      : [{ label: 'Change a column', prompt: 'I want to change how one of the columns is matched.' }],
    links: [{ label: 'Open Export', path: exportPagePath }],
  }
}
