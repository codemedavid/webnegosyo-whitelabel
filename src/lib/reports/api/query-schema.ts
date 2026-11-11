/**
 * What a client may ask `POST /api/reports/query` for (plan 2026-11-05 §5.4).
 * Strict: an unknown field is refused, never ignored. The tenant is checked
 * against the caller's own account by the report context, so naming another
 * store here only earns a refusal.
 */

import { z } from 'zod'
import { REPORT_PRESETS, UNASSIGNED_BRANCH } from '../period'

export const REPORT_SECTIONS = [
  'summary',
  'periods',
  'items',
  'categories',
  'payments',
  'channels',
  'order_types',
  'branches',
  'hours',
  'profit',
] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]

/** One request asks for a screen's worth, not the whole suite: each section is several reads. */
export const MAX_SECTIONS_PER_REQUEST = 6

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const reportQuerySchema = z
  .object({
    tenantId: z.uuid(),
    period: z
      .object({ preset: z.enum(REPORT_PRESETS), from: dayKey.optional(), to: dayKey.optional() })
      .strict(),
    compare: z.enum(['previous', 'last_year', 'none']).default('previous'),
    branch: z.union([z.literal(UNASSIGNED_BRANCH), z.uuid()]).nullable().default(null),
    sections: z
      .array(z.enum(REPORT_SECTIONS))
      .min(1)
      .max(MAX_SECTIONS_PER_REQUEST)
      .transform((sections) => [...new Set(sections)]),
    grain: z.enum(['hour', 'day', 'week', 'month']).optional(),
  })
  .strict()

export type ReportQuery = z.infer<typeof reportQuerySchema>

/** The query as the report context's URL parameters (`period.ts` `parseReportSearchParams`). */
export function toReportSearchRecord(query: ReportQuery): Record<string, string> {
  const compare = query.compare === 'none' ? '0' : query.compare === 'last_year' ? 'year' : '1'
  return {
    period: query.period.preset,
    ...(query.period.from ? { from: query.period.from } : {}),
    ...(query.period.to ? { to: query.period.to } : {}),
    ...(query.branch ? { branch: query.branch } : {}),
    compare,
  }
}
