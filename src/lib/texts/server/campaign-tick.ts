/**
 * Server campaigns in the 5-minute automations tick (server/tick.ts calls
 * `runCampaignsForStore` for every store with a `scheduled` campaign).
 * Server-only (service role).
 *
 * Per store, in order:
 *   1. re-plan runs a crash left `pending` (idempotent);
 *   2. for each scheduled campaign without an open run:
 *        due + an enabled phone      → start the run;
 *        due + no phone              → wait (the page says "waiting for phone");
 *        more than a day late        → pause it (`missed_no_phone`), never send it;
 *   3. close `running` runs whose texts are all settled (none queued/claimed).
 * Runs of paused campaigns are never closed: Resume puts their texts back.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSettings } from '@/lib/sms-automations/api/reads'
import { CAMPAIGN_COLUMNS, campaignFromRow, dueOf, type CampaignRecord, type RunRecord } from '../campaign-view'
import { recoverPendingRuns, startCampaignRun } from './campaign-run'
import { readPhoneReadiness } from './audience-inputs'
import { isOpenRun, readRunsForCampaigns } from './campaign-runs'
import { readAll } from './paged'

export interface CampaignTickResult {
  started: number
  queued: number
  missed: number
  recovered: number
  closed: number
}

/** Stores with at least one campaign the server runs (paged; no `in (...)` of every store). */
export async function serverCampaignStores(client: SupabaseClient): Promise<Set<string>> {
  const rows = await readAll<{ tenant_id: string }>('server campaigns', (from, to) => client.from('sms_campaigns')
    .select('tenant_id').eq('status', 'scheduled').eq('delivery', 'server').order('tenant_id').range(from, to))
  return new Set(rows.map((row) => row.tenant_id))
}

async function readScheduled(db: SupabaseClient, tenantId: string): Promise<CampaignRecord[]> {
  const { data, error } = await db.from('sms_campaigns').select(CAMPAIGN_COLUMNS)
    .eq('tenant_id', tenantId).eq('status', 'scheduled').eq('delivery', 'server').order('id').limit(200)
  if (error) throw new Error(`scheduled campaigns could not be read: ${error.message}`)
  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => campaignFromRow(row) ?? [])
}

async function pauseMissed(db: SupabaseClient, tenantId: string, campaignId: string): Promise<boolean> {
  const { data, error } = await db.from('sms_campaigns').update({ status: 'paused', pause_reason: 'missed_no_phone' })
    .eq('tenant_id', tenantId).eq('id', campaignId).eq('status', 'scheduled').select('id')
  if (error) throw new Error(`missed campaign could not be paused: ${error.message}`)
  return (data ?? []).length === 1
}

async function hasUnsettledTexts(db: SupabaseClient, tenantId: string, runId: string): Promise<boolean> {
  const { count, error } = await db.from('sms_outbox').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('campaign_run_id', runId).in('status', ['queued', 'claimed'])
  if (error) throw new Error(`campaign texts could not be counted: ${error.message}`)
  return (count ?? 0) > 0
}

async function closeSettledRuns(db: SupabaseClient, tenantId: string, runs: readonly RunRecord[], now: Date): Promise<number> {
  let closed = 0
  for (const run of runs.filter((r) => r.delivery === 'server' && r.status === 'running')) {
    if (await hasUnsettledTexts(db, tenantId, run.id)) continue
    const { data, error } = await db.from('sms_campaign_runs').update({ status: 'completed', completed_at: now.toISOString() })
      .eq('tenant_id', tenantId).eq('id', run.id).eq('status', 'running').select('id')
    if (error) throw new Error(`campaign run could not be closed: ${error.message}`)
    closed += (data ?? []).length
  }
  return closed
}

interface DueWork {
  campaign: CampaignRecord
  runs: RunRecord[]
}

async function actOnDue(db: SupabaseClient, tenantId: string, work: DueWork, ctx: { hasPhone: boolean; quiet: { start: string; end: string }; now: Date }) {
  const due = dueOf(work.campaign, work.runs, ctx.quiet, ctx.now)
  if (due.state === 'missed') return { missed: (await pauseMissed(db, tenantId, work.campaign.id)) ? 1 : 0, started: 0, queued: 0 }
  if (due.state !== 'due' || !due.dueAt || !ctx.hasPhone) return { missed: 0, started: 0, queued: 0 }
  const outcome = await startCampaignRun(db, tenantId, work.campaign.id, { trigger: 'schedule', dueAt: due.dueAt, now: ctx.now })
  const isStarted = outcome.ok && outcome.value.isNew
  return { missed: 0, started: isStarted ? 1 : 0, queued: outcome.ok ? outcome.value.queued : 0 }
}

export async function runCampaignsForStore(db: SupabaseClient, tenantId: string, now: Date): Promise<CampaignTickResult> {
  const result: CampaignTickResult = { started: 0, queued: 0, missed: 0, recovered: 0, closed: 0 }
  const campaigns = await readScheduled(db, tenantId)
  if (campaigns.length === 0) return result
  const [settings, phones, runs] = await Promise.all([
    readSettings(db, tenantId),
    readPhoneReadiness(db, tenantId, now),
    readRunsForCampaigns(db, tenantId, campaigns.map((c) => c.id)),
  ])
  const recovered = await recoverPendingRuns(db, tenantId, now)
  const ctx = { hasPhone: phones.enabledPhones > 0, quiet: { start: settings.quietHoursStart, end: settings.quietHoursEnd }, now }
  const totals = { ...result, recovered }
  for (const campaign of campaigns) {
    const own = runs.filter((run) => run.campaignId === campaign.id)
    if (own.some(isOpenRun)) continue
    const step = await actOnDue(db, tenantId, { campaign, runs: own }, ctx)
    totals.started += step.started
    totals.queued += step.queued
    totals.missed += step.missed
  }
  return { ...totals, closed: await closeSettledRuns(db, tenantId, runs, now) }
}

