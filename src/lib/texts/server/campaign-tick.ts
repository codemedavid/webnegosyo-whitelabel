/**
 * Server campaigns in the 5-minute automations tick (server/tick.ts calls
 * `runCampaignsForStore` for every store with a scheduled campaign or an open
 * server run). Server-only (service role).
 *
 * Per store, each step isolated (one failure is logged, the rest still run):
 *   1. reconcile open runs with their campaign's REAL status — a pause or
 *      archive written outside the web (old app, SQL) withdraws the waiting
 *      texts here; a campaign scheduled again gets its paused texts back;
 *   2. re-plan runs a crash left `pending` (live campaigns only);
 *   3. scan scheduled campaigns (paged, finished ones filtered in SQL):
 *        due + an enabled phone      → start the run;
 *        due + no phone              → wait ("waiting for phone");
 *        more than a day late        → pause it (`missed_no_phone`), never send it;
 *   4. close `running` runs whose texts are all settled (never while paused).
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import { readSettings } from '@/lib/sms-automations/api/reads'
import { CAMPAIGN_COLUMNS, campaignFromRow, dueOf, type CampaignRecord, type RunRecord } from '../campaign-view'
import { addManilaDays, toManilaParts, type QuietWindow } from '../schedule'
import { readPhoneReadiness } from './audience-inputs'
import { recoverPendingRuns, startCampaignRun } from './campaign-run'
import { isOpenRun, readRunsForCampaigns, requeuePausedTexts, withdrawRunTexts } from './campaign-runs'
import { PAGE_SIZE, chunk, readAll } from './paged'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
/** One-offs dated before this many days ago are finished or long missed: not scanned. */
const ONE_OFF_LOOKBACK_DAYS = 2
const MAX_OPEN_RUNS = 200

export interface CampaignTickResult {
  started: number
  queued: number
  missed: number
  recovered: number
  closed: number
  /** Campaigns (or steps) that failed this tick; logged, retried next tick. */
  failed: number
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Stores with a scheduled server campaign OR an open server run (paged; no `in (...)` of every store). */
export async function serverCampaignStores(client: SupabaseClient): Promise<Set<string>> {
  const [scheduled, open] = await Promise.all([
    readAll<{ tenant_id: string }>('server campaigns', (from, to) => client.from('sms_campaigns')
      .select('tenant_id').eq('status', 'scheduled').eq('delivery', 'server').order('tenant_id').range(from, to)),
    readAll<{ tenant_id: string }>('open campaign runs', (from, to) => client.from('sms_campaign_runs')
      .select('tenant_id').eq('delivery', 'server').in('status', ['pending', 'running']).order('tenant_id').range(from, to)),
  ])
  return new Set([...scheduled, ...open].map((row) => row.tenant_id))
}

// ─── 1. Reconcile ────────────────────────────────────────────────────────────

interface OpenRun {
  id: string
  campaign_id: string
  status: 'pending' | 'running'
}

async function readOpenRuns(db: SupabaseClient, tenantId: string): Promise<{ runs: OpenRun[]; statusOf: Map<string, string> }> {
  const { data, error } = await db.from('sms_campaign_runs').select('id, campaign_id, status')
    .eq('tenant_id', tenantId).eq('delivery', 'server').in('status', ['pending', 'running']).order('id').limit(MAX_OPEN_RUNS)
  if (error) throw new Error(`open campaign runs could not be read: ${error.message}`)
  const runs = (data ?? []) as OpenRun[]
  const statusOf = new Map<string, string>()
  for (const ids of chunk([...new Set(runs.map((run) => run.campaign_id))])) {
    const read = await db.from('sms_campaigns').select('id, status').eq('tenant_id', tenantId).in('id', ids)
    if (read.error) throw new Error(`campaigns could not be read: ${read.error.message}`)
    for (const row of (read.data ?? []) as { id: string; status: string }[]) statusOf.set(row.id, row.status)
  }
  return { runs, statusOf }
}

async function closeRuns(db: SupabaseClient, tenantId: string, runIds: string[], now: Date): Promise<number> {
  if (runIds.length === 0) return 0
  const { data, error } = await db.from('sms_campaign_runs').update({ status: 'completed', completed_at: now.toISOString() })
    .eq('tenant_id', tenantId).in('id', runIds).in('status', ['pending', 'running']).select('id')
  if (error) throw new Error(`campaign runs could not be closed: ${error.message}`)
  return (data ?? []).length
}

/** Waiting texts follow the campaign's status, whoever changed it. Returns runs closed (archived elsewhere). */
async function reconcileOpenRuns(db: SupabaseClient, tenantId: string, open: { runs: OpenRun[]; statusOf: Map<string, string> }, now: Date) {
  const byStatus = (wanted: (status: string) => boolean) =>
    open.runs.filter((run) => wanted(open.statusOf.get(run.campaign_id) ?? 'archived')).map((run) => run.id)
  await withdrawRunTexts(db, tenantId, byStatus((s) => s === 'paused'), 'paused')
  await requeuePausedTexts(db, tenantId, byStatus((s) => s === 'scheduled'), now)
  const gone = byStatus((s) => s !== 'paused' && s !== 'scheduled')
  await withdrawRunTexts(db, tenantId, gone, 'archived')
  return closeRuns(db, tenantId, gone, now)
}

// ─── 3. Scan ─────────────────────────────────────────────────────────────────

/** Scheduled server campaigns that can still have an occurrence: one-offs from the last 2 days, repeats not ended. */
async function readScheduled(db: SupabaseClient, tenantId: string, now: Date): Promise<CampaignRecord[]> {
  const today = toManilaParts(now).date
  const rows: Record<string, unknown>[] = []
  let lastId: string | null = null
  for (;;) {
    const base = db.from('sms_campaigns').select(CAMPAIGN_COLUMNS)
      .eq('tenant_id', tenantId).eq('status', 'scheduled').eq('delivery', 'server')
      .or(`schedule_kind.neq.one_off,schedule_date.gte.${addManilaDays(today, -ONE_OFF_LOOKBACK_DAYS)}`)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
    const { data, error } = await (lastId ? base.gt('id', lastId) : base).order('id').limit(PAGE_SIZE)
    if (error) throw new Error(`scheduled campaigns could not be read: ${error.message}`)
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows.flatMap((row) => campaignFromRow(row) ?? [])
    lastId = String(page[page.length - 1].id)
  }
}

async function pauseMissed(db: SupabaseClient, tenantId: string, campaignId: string): Promise<boolean> {
  const { data, error } = await db.from('sms_campaigns').update({ status: 'paused', pause_reason: 'missed_no_phone' })
    .eq('tenant_id', tenantId).eq('id', campaignId).eq('status', 'scheduled').select('id')
  if (error) throw new Error(`missed campaign could not be paused: ${error.message}`)
  return (data ?? []).length === 1
}

interface ScanContext {
  hasPhone: boolean
  quiet: QuietWindow
  now: Date
}

async function actOnDue(db: SupabaseClient, tenantId: string, campaign: CampaignRecord, runs: RunRecord[], ctx: ScanContext) {
  const due = dueOf(campaign, runs, ctx.quiet, ctx.now)
  if (due.state === 'missed') return { missed: (await pauseMissed(db, tenantId, campaign.id)) ? 1 : 0, started: 0, queued: 0 }
  if (due.state !== 'due' || !due.dueAt || !ctx.hasPhone) return { missed: 0, started: 0, queued: 0 }
  const outcome = await startCampaignRun(db, tenantId, campaign.id, { trigger: 'schedule', dueAt: due.dueAt, now: ctx.now })
  if (!outcome.ok && outcome.code === 'plan_failed') throw new Error(outcome.error)
  return { missed: 0, started: outcome.ok && outcome.value.isNew ? 1 : 0, queued: outcome.ok ? outcome.value.queued : 0 }
}

async function scanScheduled(db: SupabaseClient, tenantId: string, now: Date, totals: CampaignTickResult): Promise<void> {
  const campaigns = await readScheduled(db, tenantId, now)
  if (campaigns.length === 0) return
  const [settings, phones, runs] = await Promise.all([
    readSettings(db, tenantId), readPhoneReadiness(db, tenantId, now), readRunsForCampaigns(db, tenantId, campaigns.map((c) => c.id)),
  ])
  const ctx: ScanContext = { hasPhone: phones.enabledPhones > 0, quiet: { start: settings.quietHoursStart, end: settings.quietHoursEnd }, now }
  for (const campaign of campaigns) {
    const own = runs.filter((run) => run.campaignId === campaign.id)
    if (own.some(isOpenRun)) continue
    try {
      const step = await actOnDue(db, tenantId, campaign, own, ctx)
      totals.started += step.started
      totals.queued += step.queued
      totals.missed += step.missed
    } catch (error) {
      totals.failed += 1
      log.error('campaign tick failed', { tenantId, campaignId: campaign.id, error: message(error) })
    }
  }
}

// ─── 4. Close ────────────────────────────────────────────────────────────────

async function hasUnsettledTexts(db: SupabaseClient, tenantId: string, runId: string): Promise<boolean> {
  const { count, error } = await db.from('sms_outbox').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('campaign_run_id', runId).in('status', ['queued', 'claimed'])
  if (error) throw new Error(`campaign texts could not be counted: ${error.message}`)
  return (count ?? 0) > 0
}

async function closeSettledRuns(db: SupabaseClient, tenantId: string, open: { runs: OpenRun[]; statusOf: Map<string, string> }, now: Date) {
  const candidates = open.runs.filter((run) => run.status === 'running' && open.statusOf.get(run.campaign_id) === 'scheduled')
  const settled: string[] = []
  for (const run of candidates) if (!(await hasUnsettledTexts(db, tenantId, run.id))) settled.push(run.id)
  return closeRuns(db, tenantId, settled, now)
}

// ─── The store ───────────────────────────────────────────────────────────────

async function step<T>(label: string, tenantId: string, totals: CampaignTickResult, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (error) {
    totals.failed += 1
    log.error(`campaign tick: ${label} failed`, { tenantId, error: message(error) })
    return fallback
  }
}

export async function runCampaignsForStore(db: SupabaseClient, tenantId: string, now: Date): Promise<CampaignTickResult> {
  const totals: CampaignTickResult = { started: 0, queued: 0, missed: 0, recovered: 0, closed: 0, failed: 0 }
  const empty = { runs: [] as OpenRun[], statusOf: new Map<string, string>() }
  const open = await step('open runs', tenantId, totals, () => readOpenRuns(db, tenantId), empty)
  totals.closed += await step('reconcile', tenantId, totals, () => reconcileOpenRuns(db, tenantId, open, now), 0)
  totals.recovered = await step('recover', tenantId, totals, () => recoverPendingRuns(db, tenantId, now), 0)
  await step('scan', tenantId, totals, () => scanScheduled(db, tenantId, now, totals), undefined)
  totals.closed += await step('close', tenantId, totals, () => closeSettledRuns(db, tenantId, open, now), 0)
  return totals
}
