import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { ReportContext } from '@/lib/reports/read/report-context'
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
}

const LOG_COLUMNS = 'id, user_label, sheets, left_out, preset, period_from, period_to, branch, format, source, row_counts, bytes, created_at'

interface LogClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any -- report_exports is not in the generated types until the migration is applied
}

async function logClient(): Promise<LogClient> {
  return (await createClient()) as unknown as LogClient
}

/** The caller's own name as the store typed it; a failed read just leaves the label blank. */
async function userLabel(client: LogClient, userId: string): Promise<string | null> {
  const { data } = await client.from('app_users').select('display_name, email').eq('user_id', userId).maybeSingle()
  const label = (data?.display_name as string | null)?.trim() || (data?.email as string | null)?.trim() || null
  return label ? label.slice(0, 120) : null
}

/**
 * Writes the export's log row as the CALLER (RLS: own row, `reports` key).
 * Throws when the row was not written: a file that was not logged is not sent.
 */
export async function logExport(
  userId: string,
  request: Pick<ExportRequest, 'tenantId' | 'period' | 'format' | 'source'>,
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
    })
    .select('id')
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error(`export log not written: ${error?.message ?? 'no row came back'}`)
  }
}

/** The newest exports this caller may see (their own; the store's for the owner and `activity_view`). */
export async function listRecentExports(tenantId: string, limit = 10): Promise<ExportLogEntry[]> {
  const client = await logClient()
  const { data, error } = await client
    .from('report_exports')
    .select(LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`recent exports could not be read: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    userLabel: (row.user_label as string | null) ?? null,
    sheets: (row.sheets as string[]) ?? [],
    leftOut: (row.left_out as string[]) ?? [],
    preset: String(row.preset),
    periodFrom: String(row.period_from),
    periodTo: String(row.period_to),
    branch: (row.branch as string | null) ?? null,
    format: row.format === 'csv' ? 'csv' : 'xlsx',
    source: String(row.source),
    rowCounts: (row.row_counts as Record<string, number>) ?? {},
    bytes: Number(row.bytes ?? 0),
    createdAt: String(row.created_at),
  }))
}
