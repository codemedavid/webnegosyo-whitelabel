/**
 * What a client may ask `POST /api/exports` for. Strict: an unknown field is
 * refused, never ignored. The tenant is checked against the caller's own
 * account by the report context.
 */

import { z } from 'zod'
import { REPORT_PRESETS, UNASSIGNED_BRANCH } from '@/lib/reports/period'
import { SHEET_IDS } from './catalogue'

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const
export const EXPORT_SOURCES = ['page', 'button', 'owl'] as const
export type ExportSource = (typeof EXPORT_SOURCES)[number]

export const exportRequestSchema = z
  .object({
    tenantId: z.uuid(),
    /** `preview` = what the file would hold (sheets, row counts, a peek); nothing is stored. */
    mode: z.enum(['preview', 'file']).default('file'),
    sheets: z
      .array(z.enum(SHEET_IDS))
      .min(1)
      .max(SHEET_IDS.length)
      .transform((sheets) => [...new Set(sheets)]),
    period: z.object({ preset: z.enum(REPORT_PRESETS), from: dayKey.optional(), to: dayKey.optional() }).strict(),
    branch: z.union([z.literal(UNASSIGNED_BRANCH), z.uuid()]).nullable().default(null),
    format: z.enum(EXPORT_FORMATS).default('xlsx'),
    source: z.enum(EXPORT_SOURCES).default('page'),
  })
  .strict()

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
