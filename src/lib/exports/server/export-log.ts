import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database.generated'
import type { ReportContext } from '@/lib/reports/read/report-context'
import { customReportSpecSchema, type CustomReportSpec } from '../custom-report'
import type { ExportRequest } from '../request-schema'
import type { ExportResult } from '../run-export'

export interface ExportLogEntry {
  id: string
  userLabel: string | null
  sheets: string[]
  leftOut: string[]
  preset: string
  periodFrom: string
  periodTo: string
  branch: string | null
  format: 'xlsx' | 'csv'
  source: string
  rowCounts: Record<string, number>
  bytes: number
  createdAt: string
  /**
   * What shaped the file, so "Download again" rebuilds THAT file: catalogue sheets, a custom
   * report (its spec) or a saved format (its id; null once the format was removed).
   * Rows logged before 2026-11-15 read as `sheets`.
   */
  shape: ExportShape
}

export type ExportShape =
  | { kind: 'sheets' }
  /** `spec` null = stored, but no longer a valid spec (the schema moved on): listed, not offered again. */
  | { kind: 'custom'; spec: CustomReportSpec | null }
  | { kind: 'template'; templateId: string | null }

const LOG_COLUMNS = 'id, user_label, sheets, left_out, preset, period_from, period_to, branch, format, source, row_counts, bytes, created_at, shape, custom_spec, template_id'

type LogRow = Pick<
  Tables<'report_exports'>,
  'id' | 'user_label' | 'sheets' | 'left_out' | 'preset' | 'period_from' | 'period_to' | 'branch' | 'format' | 'source' | 'row_counts' | 'bytes' | 'created_at' | 'shape' | 'custom_spec' | 'template_id'
>

/** The row's shape columns as written (20261115150000). */
function shapeColumns(request: Pick<ExportRequest, 'custom' | 'template'>): { shape: ExportShape['kind']; custom_spec: CustomReportSpec | null; template_id: string | null } {
  if (request.template) return { shape: 'template', custom_spec: null, template_id: request.template }
  if (request.custom) return { shape: 'custom', custom_spec: request.custom, template_id: null }
  return { shape: 'sheets', custom_spec: null, template_id: null }
}

/** A stored shape read back. The log is a record, so a row is always listed, whatever its spec now says. */
function shapeOf(row: Pick<LogRow, 'shape' | 'custom_spec' | 'template_id'>): ExportShape {
  if (row.shape === 'template') return { kind: 'template', templateId: row.template_id ?? null }
  if (row.shape === 'custom') {
    const spec = customReportSpecSchema.safeParse(row.custom_spec)
    return { kind: 'custom', spec: spec.success ? spec.data : null }
  }
  return { kind: 'sheets' }
}

type LogClient = Awaited<ReturnType<typeof createClient>>

async function logClient(): Promise<LogClient> {
  return createClient()
}

/** The caller's own name as the store typed it; a failed read just leaves the label blank. */
async function userLabel(client: LogClient, userId: string): Promise<string | null> {
  const { data } = await client.from('app_users').select('display_name, email').eq('user_id', userId).maybeSingle()
  const label = data?.display_name?.trim() || data?.email?.trim() || null
  return label ? label.slice(0, 120) : null
}

/**
 * Writes the export's log row as the CALLER (RLS: own row, `reports` key).
 * Throws when the row was not written: a file that was not logged is not sent.
 */
export async function logExport(
  userId: string,
  request: Pick<ExportRequest, 'tenantId' | 'period' | 'format' | 'source' | 'custom' | 'template'>,
  context: ReportContext,
  result: ExportResult,
  bytes: number,
): Promise<void> {
  const client = await logClient()
  const { data, error } = await client
    .from('report_exports')
    .insert({
      tenant_id: request.tenantId,
      user_id: userId,
      user_label: await userLabel(client, userId),
      // A format may fill two tabs from one sheet: the log names each sheet once.
      sheets: [...new Set(result.sheets.map((sheet) => sheet.id))],
      left_out: result.leftOut.map((sheet) => sheet.id),
      preset: request.period.preset,
      period_from: context.period.from,
      period_to: context.period.to,
      branch: context.branch.branch,
      format: request.format,
      source: request.source,
      row_counts: result.sheets.reduce<Record<string, number>>((counts, sheet) => ({ ...counts, [sheet.id]: (counts[sheet.id] ?? 0) + sheet.rows.length }), {}),
      bytes,
      ...shapeColumns(request),
    })
    .select('id')
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error(`export log not written: ${error?.message ?? 'no row came back'}`)
  }
}

/**
 * The newest exports this caller may see: their own; the store's for the owner and store-wide
 * `activity_view`; a branch account's `activity_view` adds only rows exported for its branch (RLS).
 */
export async function listRecentExports(tenantId: string, limit = 10): Promise<ExportLogEntry[]> {
  const client = await logClient()
  const { data, error } = await client
    .from('report_exports')
    .select(LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`recent exports could not be read: ${error.message}`)
  return (data ?? []).map(toEntry)
}

/** `{ "<sheet id>": rows }` as stored; anything else (never written by logExport) reads as no counts. */
function rowCountsOf(value: LogRow['row_counts']): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
}

function toEntry(row: LogRow): ExportLogEntry {
  return {
    id: row.id,
    userLabel: row.user_label ?? null,
    sheets: row.sheets ?? [],
    leftOut: row.left_out ?? [],
    preset: row.preset,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    branch: row.branch ?? null,
    format: row.format === 'csv' ? 'csv' : 'xlsx',
    source: row.source,
    rowCounts: rowCountsOf(row.row_counts),
    bytes: Number(row.bytes ?? 0),
    createdAt: row.created_at,
    shape: shapeOf(row),
  }
}
