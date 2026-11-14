/**
 * run_saved_report — "make my Weekly owner report for last week",
 * "anong mga naka-save kong report?".
 *
 * A saved format ("My formats" on the Export page) is a custom report spec
 * the store kept under a name. This tool only FINDS one by name and runs it
 * for the dates asked: the spec comes from the database, read as the caller
 * (store-wide accounts with `reports`), and the file is built by the same
 * engine as every export. Without a name it lists what is saved. Owl never
 * saves, renames or removes a format: the owner does, with a tap.
 */

import { z } from 'zod'
import { cutoffScheduleFor } from '@/lib/assistant/data/cutoff-schedule'
import { resolveWhen, WHEN_PERIODS } from '@/lib/assistant/insights/when'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'
import { ExportError } from '@/lib/exports/errors'
import { findTemplate, templateSummary, type ReportTemplate } from '@/lib/exports/report-templates'
import { runCustomExport } from '@/lib/exports/run-custom-export'
import { loadExportInput } from '@/lib/exports/server/load-export-input'
import { listReportTemplates } from '@/lib/exports/server/report-templates'
import { buildCustomReportResult } from './custom-report'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

const input = z.object({
  name: z.string().trim().min(1).max(60).optional().describe('The saved format’s name as the owner said it. Leave out to list what is saved'),
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

function unavailable(reason: string, extra: Record<string, unknown> = {}): ToolResult {
  return { facts: { ready: false, reason, ...extra } }
}

/** What the model may know about the saved formats: their names and what each is made of. */
export function savedFormatFacts(templates: readonly ReportTemplate[]): Array<{ name: string; madeOf: string }> {
  return templates.map((template) => ({ name: template.name, madeOf: templateSummary(template.spec) }))
}

export const runSavedReportTool: AssistantToolDef<Input> = {
  name: 'run_saved_report',
  description:
    'Make a file from a report format the store SAVED earlier ("my weekly report", "yung format ko", "My formats"), for any dates. Call without a name to list the saved formats. Not for new shapes: those are build_custom_report.',
  access: { permission: 'reports' },
  isAvailable: (flags) => flags.isPlatformOrders === true,
  input,
  async run(ctx, args) {
    let templates: ReportTemplate[]
    try {
      templates = await listReportTemplates(ctx.tenantId)
    } catch {
      return unavailable('The saved formats could not be read just now. Try again in a moment.')
    }
    if (templates.length === 0) {
      return unavailable('This store has no saved formats yet.', {
        say: 'A report is kept by tapping "Save to My formats" on a custom report’s card. Offer to build the report they want with build_custom_report.',
      })
    }
    const savedFormats = savedFormatFacts(templates)
    if (!args.name) {
      return { facts: { ready: false, savedFormats, say: 'Name the saved formats and ask which one to make, and for which dates.' }, links: [{ label: 'Open Export', path: '/reports/export' }] }
    }
    const template = findTemplate(args.name, templates)
    if (!template) return unavailable(`No saved format matches "${args.name}".`, { savedFormats, say: 'Say which formats are saved and ask which one they meant.' })

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
    const loaded = await loadExportInput({ ...request, mode: 'preview', sheets: [template.spec.sheet] })
    if (loaded.kind !== 'ready') return unavailable(REFUSALS[loaded.kind])

    try {
      const result = await runCustomExport(loaded.input, template.spec)
      const query = new URLSearchParams({ period: 'custom', from: when.from, to: when.to, compare: '0' })
      const built = buildCustomReportResult(result, template.spec, request, `/reports/export?${query.toString()}`, { savedAs: template.name })
      // The owner knows it by the name they saved it under, which may differ from the tab's title.
      const card = built.card?.type === 'file' ? { ...built.card, title: template.name } : built.card
      return { ...built, card, facts: { ...built.facts, title: template.name, savedFormat: template.name } }
    } catch (error) {
      // A sheet or a column this account may not have (the format was saved by someone who holds more keys).
      if (error instanceof ExportError) return unavailable(error.message)
      throw error
    }
  },
}
