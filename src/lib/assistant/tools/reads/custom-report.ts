/**
 * build_custom_report — "average order per day this month, highest first",
 * "top 20 dishes by sales with their share".
 *
 * Owl writes a SPEC, never a figure: one catalogue sheet ("one row is a
 * day / a dish / an order"), which of its columns in what order and under
 * what headings, which rows to keep, how to sort, how many. The export engine
 * reads that sheet as the caller (same staff keys, same caps as the Export
 * page) and `applyCustomSpec` reshapes it. The card's link carries the same
 * spec, so the file is built again by the same code when it is tapped.
 *
 * Columns are named by id OR by their heading; a name the sheet does not have
 * answers with the sheet's real columns so the model can correct itself.
 * The model reads rows back only from sheets that hold no person's details.
 */

import { z } from 'zod'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { resolveWhen, WHEN_PERIODS } from '@/lib/assistant/insights/when'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'
import { EXPORT_SHEETS, SHEET_IDS, SHEET_REFUSAL_NOTES, sheetRefusal, visibleColumns, type SheetId } from '@/lib/exports/catalogue'
import { CUSTOM_FILTER_OPS, MAX_CUSTOM_COLUMNS, MAX_CUSTOM_FILTERS, MAX_CUSTOM_TOP, customReportSpecSchema, type CustomReportSpec } from '@/lib/exports/custom-report'
import { ExportError } from '@/lib/exports/errors'
import { exportHref, type ExportRequest } from '@/lib/exports/request-schema'
import { runCustomExport } from '@/lib/exports/run-custom-export'
import type { ExportResult } from '@/lib/exports/run-export'
import { loadExportInput } from '@/lib/exports/server/load-export-input'
import type { BuiltSheet, ExportCell, ExportColumn } from '@/lib/exports/types'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const name = z.string().trim().min(1).max(40)

const input = z.object({
  title: z.string().trim().min(1).max(31).describe('Short report name, e.g. "Average order per day"'),
  sheet: z.enum(SHEET_IDS).describe('What one row is: sales_by_day = a day, items = a dish, categories, order_types, channels, payments_by_method, sales_by_cashier, orders, order_lines, customers, expenses, stock_usage…'),
  columns: z.array(name).max(MAX_CUSTOM_COLUMNS).optional().describe('Columns to show, in order: ids or headings of that sheet. Leave out to be told what the sheet has'),
  rename: z.array(z.object({ column: name, as: name })).max(MAX_CUSTOM_COLUMNS).optional().describe('New headings'),
  filters: z
    .array(z.object({ column: name, op: z.enum(CUSTOM_FILTER_OPS), value: z.union([z.string().trim().min(1).max(60), z.number()]) }))
    .max(MAX_CUSTOM_FILTERS)
    .optional()
    .describe('Keep only rows where a column is / is_not / contains / at_least / at_most a value'),
  sortBy: name.optional(),
  descending: z.boolean().optional().describe('Highest first'),
  top: z.number().int().min(1).max(MAX_CUSTOM_TOP).optional().describe('Keep the first N rows after sorting'),
  period: z.enum(WHEN_PERIODS).optional().describe('Named period; ignored when from is set. Default this_month'),
  from: z.string().regex(DAY_KEY).optional().describe('First day YYYY-MM-DD'),
  to: z.string().regex(DAY_KEY).optional().describe('Last day YYYY-MM-DD; default = from'),
  format: z.enum(['xlsx', 'csv']).optional().describe('Default xlsx (Excel)'),
})
type Input = z.infer<typeof input>

const REFUSALS: Readonly<Record<string, string>> = {
  signed_out: 'Sign in again to export.',
  not_found: 'This store could not be found.',
  refused: 'This account does not have the Reports permission, which reports need.',
  unsupported: 'Reports like this are for stores on the main WebNegosyo database.',
}

/**
 * Sheets whose rows the model may read back: totals by day, dish, category,
 * channel, payment method, stock and the profit statement. Anything with a
 * customer, a staff name, a phone, a note or an order id stays in the file.
 */
export const SHEETS_OWL_MAY_READ: ReadonlySet<SheetId> = new Set<SheetId>([
  'summary',
  'sales_by_day',
  'items',
  'categories',
  'order_types',
  'channels',
  'branches',
  'payments_by_method',
  'stock_on_hand',
  'stock_usage',
  'profit',
])
const ROWS_FOR_MODEL = 12

function unavailable(reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return { facts: { ready: false, reason, ...extra } }
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

/** A column by its id or its heading, however it was cased or spaced. */
function findColumn(asked: string, columns: readonly ExportColumn[]): ExportColumn | null {
  const wanted = fold(asked)
  return columns.find((column) => column.id === asked.trim()) ?? columns.find((column) => fold(column.id) === wanted || fold(column.header) === wanted) ?? null
}

export type SpecDraft = { ok: true; spec: CustomReportSpec } | { ok: false; reason: string; unknown: string[] }

/** The tool's loose input as a strict spec, every named column resolved against the sheet's real ones. */
export function draftCustomSpec(args: Input, columns: readonly ExportColumn[]): SpecDraft {
  const unknown = new Set<string>()
  const idOf = (asked: string): string => {
    const column = findColumn(asked, columns)
    if (!column) unknown.add(asked)
    return column?.id ?? ''
  }
  const shown = [...new Set((args.columns ?? []).map(idOf))]
  const headings = new Map((args.rename ?? []).map((entry) => [idOf(entry.column), entry.as]))
  const filters = (args.filters ?? []).map((filter) => ({ column: idOf(filter.column), op: filter.op, value: filter.value }))
  const sort = args.sortBy ? { column: idOf(args.sortBy), descending: args.descending ?? false } : null
  if (unknown.size > 0) return { ok: false, reason: `This sheet has no column called ${[...unknown].map((entry) => `"${entry}"`).join(', ')}.`, unknown: [...unknown] }
  if (shown.length === 0) return { ok: false, reason: 'Say which columns to show.', unknown: [] }

  const parsed = customReportSpecSchema.safeParse({
    title: args.title,
    sheet: args.sheet,
    columns: shown.map((id) => (headings.has(id) ? { id, header: headings.get(id) } : { id })),
    filters,
    sort,
    top: args.top ?? null,
  })
  if (parsed.success) return { ok: true, spec: parsed.data }
  const issue = parsed.error.issues[0]
  return { ok: false, reason: `That report could not be set up: ${issue?.path.join('.') || 'spec'} ${issue?.message ?? ''}`.trim(), unknown: [] }
}

function forModel(cell: ExportCell): string | number | null {
  const value = cell !== null && typeof cell === 'object' ? cell.value : cell
  return typeof value === 'number' ? Math.round(value * 100) / 100 : value
}

/** The first rows as heading → value, for sheets the model may read. */
function firstRows(sheet: BuiltSheet): Array<Record<string, string | number | null>> {
  return sheet.rows.slice(0, ROWS_FOR_MODEL).map((row) => Object.fromEntries(sheet.columns.map((column, index) => [column.header, forModel(row[index])])))
}

export function buildCustomReportResult(
  result: ExportResult,
  spec: CustomReportSpec,
  request: Pick<ExportRequest, 'tenantId' | 'period' | 'branch' | 'format'>,
  exportPagePath: string,
  /** `savedAs` = this ran a format the store already keeps under that name, so the card offers no Save. */
  options: { savedAs?: string } = {},
): ToolResult {
  const [sheet] = result.sheets
  const mayRead = SHEETS_OWL_MAY_READ.has(spec.sheet)
  const other = request.format === 'xlsx' ? 'csv' : 'xlsx'
  const link = (format: 'xlsx' | 'csv') => exportHref({ ...request, sheets: [spec.sheet], format, source: 'owl', custom: spec })
  // The lines about how it was shaped come first; the sheet's own notes follow.
  const shaped = sheet.notes.slice(0, 2 + spec.filters.length + (spec.sort ? 1 : 0))
  return {
    facts: {
      ready: true,
      title: sheet.name,
      period: result.header.periodLabel,
      branch: result.header.branchLabel,
      rows: sheet.rows.length,
      columns: sheet.columns.map((column) => column.header),
      ...(mayRead ? { firstRows: firstRows(sheet), moneyIsPesos: true } : {}),
      say: mayRead
        ? 'The file is on the card. You may quote firstRows (percent columns are ratios: 0.25 = 25%); say nothing about rows you were not given.'
        : 'The file is on the card. Its rows hold people’s details, so you were not given them: say what the report lists, not what it says.',
      ...(options.savedAs ? {} : { keep: 'To keep this report for other dates the owner taps "Save to My formats" on the card. You cannot save it for them; a different name = build it again with that title.' }),
    },
    card: {
      type: 'file',
      title: sheet.name,
      subtitle: `${result.header.periodLabel} · ${result.header.branchLabel}`,
      sheets: [{ name: sheet.name, rows: sheet.rows.length }],
      notes: sheet.rows.length === 0 ? [...shaped, 'No rows matched, so the file holds its headings only.'] : shaped,
      downloads: [
        { label: request.format === 'xlsx' ? 'Download Excel' : 'Download CSV', href: link(request.format) },
        { label: other === 'xlsx' ? 'Excel' : 'CSV', href: link(other) },
      ],
      ...(options.savedAs ? {} : { save: { tenantId: request.tenantId, name: spec.title, spec } }),
    },
    chips: options.savedAs
      ? [{ label: 'Same for last month', prompt: `Make my saved format "${options.savedAs}" for last month.` }]
      : [
          { label: 'Same for last month', prompt: 'Make the same report for last month.' },
          { label: 'Add a column', prompt: 'What other columns can that report have?' },
        ],
    links: [{ label: 'Open Export', path: exportPagePath }],
  }
}

export const buildCustomReportTool: AssistantToolDef<Input> = {
  name: 'build_custom_report',
  description:
    'Make a report file shaped the way the owner asks: one sheet (what a row is), chosen columns in order, renamed headings, filters, sort, top N. Use when export_report\'s ready-made sheets are not the shape asked for ("average order per day", "top 20 dishes with share", "only GCash orders"). Call without columns first if unsure what the sheet has.',
  access: { permission: 'reports' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, args) {
    const resolved = resolveWhen({ period: args.period, from: args.from, to: args.to }, Date.now(), await cutoffScheduleFor(ctx), 'this_month')
    if (!resolved.ok) return unavailable(resolved.error)
    const { when } = resolved
    const request = {
      tenantId: ctx.tenantId,
      period: { preset: 'custom' as const, from: when.from, to: when.to },
      branch: null,
      format: args.format ?? ('xlsx' as const),
      source: 'owl' as const,
    }
    const loaded = await loadExportInput({ ...request, mode: 'preview', sheets: [args.sheet] })
    if (loaded.kind !== 'ready') return unavailable(REFUSALS[loaded.kind])

    const sheet = EXPORT_SHEETS[args.sheet]
    const refusal = sheetRefusal(sheet, { has: loaded.input.access.has, isMultiBranch: loaded.input.context.isMultiBranch })
    if (refusal) return unavailable(`${sheet.name} is not available: ${SHEET_REFUSAL_NOTES[refusal]}.`)

    const columns = visibleColumns(sheet, loaded.input.access)
    const draft = draftCustomSpec(args, columns)
    if (!draft.ok) {
      return unavailable(draft.reason, {
        sheet: sheet.name,
        rowIs: sheet.rowIs,
        columnsYouCanUse: columns.map((column) => ({ id: column.id, heading: column.header })),
        say: 'Call build_custom_report again with ids from columnsYouCanUse. If the owner asked for something this sheet does not hold, say so.',
      })
    }

    try {
      const result = await runCustomExport(loaded.input, draft.spec)
      const query = new URLSearchParams({ period: 'custom', from: when.from, to: when.to, compare: '0', sheets: args.sheet })
      return buildCustomReportResult(result, draft.spec, request, `/reports/export?${query.toString()}`)
    } catch (error) {
      if (error instanceof ExportError) return unavailable(error.message)
      throw error
    }
  },
}
