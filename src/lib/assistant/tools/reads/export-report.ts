/**
 * export_report — "send me an Excel of today's orders with the cashier".
 *
 * Owl does not build a file and never sees its rows. It picks sheets from the
 * export catalogue (the same one the Export page uses), the server works out
 * what THIS person may have and how many rows each tab would hold, and the
 * answer is a card with download links. A link builds the file when tapped,
 * as the person who taps it (`GET /api/exports`), so the file is exactly what
 * the Export page would give them — same figures, same staff keys, same log.
 */

import { z } from 'zod'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { resolveWhen, WHEN_PERIODS } from '@/lib/assistant/insights/when'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'
import { SHEET_IDS, type SheetId } from '@/lib/exports/catalogue'
import { ExportError } from '@/lib/exports/errors'
import { EXPORT_PACKS, exportCardGroups, packSheets } from '@/lib/exports/export-page-model'
import { exportHref, type ExportRequest } from '@/lib/exports/request-schema'
import { previewExport, type ExportPreview } from '@/lib/exports/run-export'
import { loadExportInput } from '@/lib/exports/server/load-export-input'

const PACK_IDS = ['everything', 'accountant', 'profit', 'staff'] as const
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

const input = z.object({
  sheets: z.array(z.enum(SHEET_IDS)).max(SHEET_IDS.length).optional().describe('Tabs to include'),
  pack: z.enum(PACK_IDS).optional().describe('Ready-made set; used when sheets is empty. everything = the whole day/period'),
  period: z.enum(WHEN_PERIODS).optional().describe('Named period; ignored when from is set. Default today'),
  from: z.string().regex(DAY_KEY).optional().describe('First day YYYY-MM-DD'),
  to: z.string().regex(DAY_KEY).optional().describe('Last day YYYY-MM-DD; default = from'),
  format: z.enum(['xlsx', 'csv']).optional().describe('Default xlsx (Excel)'),
})
type Input = z.infer<typeof input>

const REFUSALS: Readonly<Record<string, string>> = {
  signed_out: 'Sign in again to export.',
  not_found: 'This store could not be found.',
  refused: 'This account does not have the Reports permission, which exports need.',
  unsupported: 'Exports are for stores on the main WebNegosyo database. This store still exports from the app.',
}

function unavailable(reason: string): ToolResult {
  return { facts: { ready: false, reason } }
}

export function buildExportResult(preview: ExportPreview, request: Omit<ExportRequest, 'mode'>, exportPagePath: string): ToolResult {
  const tabs = preview.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows }))
  const notes = [...preview.leftOut.map((sheet) => sheet.note), ...(tabs.every((tab) => tab.rows === 0) ? ['Nothing was recorded for these dates, so the tabs hold their headings only.'] : [])]
  const other = request.format === 'xlsx' ? 'csv' : 'xlsx'
  return {
    facts: {
      ready: true,
      period: preview.header.periodLabel,
      branch: preview.header.branchLabel,
      tabs,
      leftOut: preview.leftOut.map((sheet) => sheet.note),
      say: 'The file is on the card with its download button. Say what is in it in one line; do not quote figures you did not read with another tool.',
    },
    card: {
      type: 'file',
      title: tabs.length === 1 ? tabs[0].name : `${tabs.length} sheets in one file`,
      subtitle: `${preview.header.periodLabel} · ${preview.header.branchLabel}`,
      sheets: tabs,
      notes,
      downloads: [
        { label: request.format === 'xlsx' ? 'Download Excel' : 'Download CSV', href: exportHref({ ...request, source: 'owl' }) },
        { label: other === 'xlsx' ? 'Excel' : 'CSV', href: exportHref({ ...request, format: other, source: 'owl' }) },
      ],
    },
    chips: [
      { label: 'Add the order lines', prompt: 'Add every dish on every order to that file.' },
      { label: 'Same for yesterday', prompt: 'Make the same file for yesterday.' },
    ],
    links: [{ label: 'Open Export', path: exportPagePath }],
  }
}

export const exportReportTool: AssistantToolDef<Input> = {
  name: 'export_report',
  description:
    'Make an Excel/CSV file for any dates: sales summary, by day, items, categories, payments, orders (with cashier, shift, customer), order_lines, customers, discounts, cancelled, sales_by_cashier, shifts, cash_moves, remittances (cash handed over), day_closes, activity (who did what), stock_on_hand, stock_movements, stock_usage (used, wasted and missing per ingredient per day), expenses, profit (statement). "Export today/everything" = pack everything. Answers with a download card.',
  access: { permission: 'reports' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, args) {
    const resolved = resolveWhen({ period: args.period, from: args.from, to: args.to }, Date.now(), await cutoffScheduleFor(ctx), 'today')
    if (!resolved.ok) return unavailable(resolved.error)
    const { when } = resolved
    const base: Omit<ExportRequest, 'mode' | 'sheets'> = {
      tenantId: ctx.tenantId,
      period: { preset: 'custom', from: when.from, to: when.to },
      branch: null,
      format: args.format ?? 'xlsx',
      source: 'owl',
    }
    const loaded = await loadExportInput({ ...base, mode: 'preview', sheets: ['summary'] })
    if (loaded.kind !== 'ready') return unavailable(REFUSALS[loaded.kind])

    const groups = exportCardGroups(loaded.input.access, loaded.input.context.isMultiBranch)
    const pack = EXPORT_PACKS.find((entry) => entry.id === (args.pack ?? 'everything')) ?? EXPORT_PACKS[0]
    const sheets: SheetId[] = args.sheets?.length ? SHEET_IDS.filter((id) => args.sheets?.includes(id)) : packSheets(pack, groups)
    if (sheets.length === 0) return unavailable('This account may not export any of those sheets.')

    try {
      const preview = await previewExport({ ...loaded.input, sheets })
      // The link asks only for what the preview kept, so the file matches the card.
      const kept = sheets.filter((id) => preview.sheets.some((sheet) => sheet.id === id))
      const query = new URLSearchParams({ period: 'custom', from: when.from, to: when.to, compare: '0', sheets: kept.join(',') })
      return buildExportResult(preview, { ...base, sheets: kept }, `/reports/export?${query.toString()}`)
    } catch (error) {
      if (error instanceof ExportError) return unavailable(error.message)
      throw error
    }
  },
}
