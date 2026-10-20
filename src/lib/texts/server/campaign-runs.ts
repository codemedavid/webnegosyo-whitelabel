/**
 * Reading `sms_campaign_runs` for the Texts engine. Server-only.
 * Runs per campaign are bounded (a six-month daily repeat is ~180), but a
 * store-wide read still pages and chunks its `in (...)` lists.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunRecord } from '../campaign-view'
import type { RunStatus } from '../schedule'
import { PAGE_SIZE, chunk, readAll } from './paged'

export const RUN_COLUMNS =
  'id, campaign_id, status, delivery, due_at, started_at, completed_at, planned_count, audience_summary, report, report_final_at'

export interface RunRow {
  id: string
  campaign_id: string
  status: RunStatus
  delivery: string | null
  due_at: string
  started_at: string | null
  completed_at: string | null
  planned_count: number | null
  audience_summary: unknown
  report: unknown
  report_final_at: string | null
}

export interface RunDetail extends RunRecord {
  plannedCount: number | null
  audienceSummary: unknown
  report: unknown
  reportFinalAt: string | null
}

export function runFromRow(row: RunRow): RunDetail {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    status: row.status,
    delivery: row.delivery === 'server' ? 'server' : 'phone',
    dueAt: row.due_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    plannedCount: row.planned_count,
    audienceSummary: row.audience_summary,
    report: row.report,
    reportFinalAt: row.report_final_at,
  }
}

export async function readRunsForCampaigns(db: SupabaseClient, tenantId: string, campaignIds: readonly string[]): Promise<RunDetail[]> {
  const groups = await Promise.all(chunk(campaignIds).map((ids) => readAll<RunRow>('campaign runs', (from, to) =>
    db.from('sms_campaign_runs').select(RUN_COLUMNS).eq('tenant_id', tenantId).in('campaign_id', ids)
      .order('id').range(from, to))))
  return groups.flat().map(runFromRow)
}

/** The list (polled every 10–30 s) reads at most this many runs, newest first; older runs are long final. */
export const MAX_LIST_RUNS = 2000

/** A store's newest runs, bounded (never throws past the cap — older runs simply drop out of the totals). */
export async function readRecentRuns(db: SupabaseClient, tenantId: string, maxRows = MAX_LIST_RUNS): Promise<RunDetail[]> {
  const rows: RunRow[] = []
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, maxRows) - 1
    const { data, error } = await db.from('sms_campaign_runs').select(RUN_COLUMNS).eq('tenant_id', tenantId)
      .order('due_at', { ascending: false }).order('id').range(from, to)
    if (error) throw new Error(`campaign runs could not be read: ${error.message}`)
    rows.push(...((data ?? []) as RunRow[]))
    if (!data || data.length < to - from + 1) break
  }
  return rows.map(runFromRow)
}

export const isOpenRun = (run: RunRecord): boolean => run.status === 'pending' || run.status === 'running'

export type WithdrawReason = 'paused' | 'archived'

/** Withdraw these runs' waiting texts (pause/archive/Owl/tick). Returns how many. */
export async function withdrawRunTexts(
  db: SupabaseClient, tenantId: string, runIds: readonly string[], reason: WithdrawReason,
): Promise<number> {
  if (runIds.length === 0) return 0
  const { data, error } = await db.from('sms_outbox').update({ status: 'cancelled', skip_reason: reason })
    .eq('tenant_id', tenantId).in('campaign_run_id', [...runIds]).eq('status', 'queued').select('id')
  if (error) throw new Error(`waiting campaign texts could not be withdrawn: ${error.message}`)
  return data?.length ?? 0
}

/** Put back texts a pause withdrew, if they have not run out of time. Returns how many. */
export async function requeuePausedTexts(db: SupabaseClient, tenantId: string, runIds: readonly string[], now: Date): Promise<number> {
  if (runIds.length === 0) return 0
  const { data, error } = await db.from('sms_outbox').update({ status: 'queued', skip_reason: null })
    .eq('tenant_id', tenantId).in('campaign_run_id', [...runIds]).eq('status', 'cancelled').eq('skip_reason', 'paused')
    .gt('expires_at', now.toISOString()).select('id')
  if (error) throw new Error(`paused campaign texts could not be put back: ${error.message}`)
  return data?.length ?? 0
}
