/**
 * What a client may ask `POST /api/exports` for. Strict: an unknown field is
 * refused, never ignored. The tenant is checked against the caller's own
 * account by the report context.
 */

import { z } from 'zod'
import { REPORT_PRESETS, UNASSIGNED_BRANCH } from '@/lib/reports/period'
import { SHEET_IDS } from './catalogue'
import { MAX_CUSTOM_PARAM_LENGTH, customReportSpecSchema, decodeCustomSpec, encodeCustomSpec, type CustomReportSpec } from './custom-report'

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const
export const EXPORT_SOURCES = ['page', 'button', 'owl'] as const
export type ExportSource = (typeof EXPORT_SOURCES)[number]

export const exportRequestSchema = z
  .object({
    tenantId: z.uuid(),
    /**
     * `preview` = what the file would hold (sheets, row counts, a peek); nothing is stored.
     * `catalogue` = the sheets and ready-made sets THIS account may pick (the merchant app's Export screen).
     */
    mode: z.enum(['preview', 'file', 'catalogue']).default('file'),
    sheets: z
      .array(z.enum(SHEET_IDS))
      .min(1)
      .max(SHEET_IDS.length)
      .transform((sheets) => [...new Set(sheets)]),
    period: z.object({ preset: z.enum(REPORT_PRESETS), from: dayKey.optional(), to: dayKey.optional() }).strict(),
    branch: z.union([z.literal(UNASSIGNED_BRANCH), z.uuid()]).nullable().default(null),
    format: z.enum(EXPORT_FORMATS).default('xlsx'),
    source: z.enum(EXPORT_SOURCES).default('page'),
    /** A custom report: ONE sheet reshaped (`custom-report.ts`). `sheets` must then be that sheet alone. */
    custom: customReportSpecSchema.nullish(),
    /**
     * A saved format ("My formats") by its id. The server reads its shape as the caller and takes the
     * sheets from it: whatever `sheets` says is ignored.
     */
    template: z.uuid().nullish(),
  })
  .strict()
  .refine((request) => !(request.custom && request.template), { message: 'A file is made from a saved format or a custom report, not both.', path: ['template'] })
  .refine((request) => !request.custom || (request.sheets.length === 1 && request.sheets[0] === request.custom.sheet), {
    message: 'A custom report is made from one sheet: sheets must name that sheet only.',
    path: ['sheets'],
  })

export type ExportRequest = z.infer<typeof exportRequestSchema>

/** The request as the report context's URL parameters; exports never compare periods. */
export function toExportSearchRecord(request: Pick<ExportRequest, 'period' | 'branch'>): Record<string, string> {
  return {
    period: request.period.preset,
    ...(request.period.from ? { from: request.period.from } : {}),
    ...(request.period.to ? { to: request.period.to } : {}),
    ...(request.branch ? { branch: request.branch } : {}),
    compare: '0',
  }
}

/**
 * The same request as a link's query string (`GET /api/exports?…`): sheets
 * comma-separated, the period as `period` + `from` + `to`. Always a file.
 */
export const exportQuerySchema = z
  .object({
    tenantId: z.string(),
    sheets: z.string(),
    period: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    branch: z.string().optional(),
    format: z.string().optional(),
    source: z.string().optional(),
    /** `encodeCustomSpec` of a custom report. */
    custom: z.string().max(MAX_CUSTOM_PARAM_LENGTH).optional(),
    /** A saved format's id. */
    template: z.string().max(40).optional(),
  })
  .strict()
  .transform((query, ctx): ExportRequest => {
    const custom: CustomReportSpec | null = query.custom ? decodeCustomSpec(query.custom) : null
    if (query.custom && !custom) {
      ctx.addIssue({ code: 'custom', message: 'That export link is not valid.' })
      return z.NEVER
    }
    const parsed = exportRequestSchema.safeParse({
      ...(custom ? { custom } : {}),
      ...(query.template ? { template: query.template } : {}),
      tenantId: query.tenantId,
      mode: 'file',
      sheets: query.sheets.split(',').filter(Boolean),
      period: { preset: query.period, ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) },
      branch: query.branch || null,
      ...(query.format ? { format: query.format } : {}),
      ...(query.source ? { source: query.source } : {}),
    })
    if (parsed.success) return parsed.data
    ctx.addIssue({ code: 'custom', message: 'That export link is not valid.' })
    return z.NEVER
  })

/** The link that downloads this export. */
export function exportHref(
  request: Pick<ExportRequest, 'tenantId' | 'sheets' | 'period' | 'branch' | 'format' | 'source'> & { custom?: CustomReportSpec | null; template?: string | null },
): string {
  const params = new URLSearchParams({ tenantId: request.tenantId, sheets: request.sheets.join(','), period: request.period.preset })
  if (request.period.from) params.set('from', request.period.from)
  if (request.period.to) params.set('to', request.period.to)
  if (request.branch) params.set('branch', request.branch)
  params.set('format', request.format)
  params.set('source', request.source)
  if (request.custom) params.set('custom', encodeCustomSpec(request.custom))
  if (request.template) params.set('template', request.template)
  return `/api/exports?${params.toString()}`
}
