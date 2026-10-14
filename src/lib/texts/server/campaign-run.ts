/**
 * Starting a server campaign run. Server-only (service role).
 *
 *   1. insert the run as `pending` (delivery server). The unique
 *      (campaign_id, due_at) index and the one-open-server-run index make a
 *      lost race or a double "Send now" a no-op;
 *   2. load guests, plan, upsert the outbox rows in chunks, IGNORING
 *      duplicates on (tenant, family, customer, occurrence_key);
 *   3. mark the run `running` (or `completed` when nobody qualifies).
 * A crash between 1 and 3 leaves a `pending` run; the tick re-plans it
 * (`recoverPendingRuns`), which the unique key makes idempotent per guest.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import { CAMPAIGN_COLUMNS, campaignFromRow, type CampaignRecord } from '../campaign-view'
import { planCampaignRun } from '../run-plan'
import { campaignExpiryMs } from '../schedule'
import type { SkippedReason } from '../types'
import { loadAudienceInputs } from './audience-inputs'
import { chunk } from './paged'

const INSERT_CHUNK = 500
/** A pending run older than this lost its planner (crash, timeout): re-plan it. */
export const STALE_PENDING_MS = 2 * 60_000
export const SERVER_DEVICE_LABEL = 'server'

export type RunTrigger = 'schedule' | 'send_now'

export interface StartRunOptions {
  trigger: RunTrigger
  dueAt: Date
  now: Date
}

export interface StartRunResult {
  runId: string
  planned: number
  queued: number
  summary: Record<SkippedReason, number>
  /** False when the run already existed (a lost race or a repeat call). */
  isNew: boolean
}

export interface AudienceSummary {
  skipped: Record<SkippedReason, number>
  filteredOut: number
  reach: number
}

const refuse = <T>(status: number, error: string, code: string): Outcome<T> => ({ ok: false, status, error, code })

export async function readCampaign(db: SupabaseClient, tenantId: string, campaignId: string): Promise<CampaignRecord | null> {
  const { data, error } = await db.from('sms_campaigns').select(CAMPAIGN_COLUMNS).eq('tenant_id', tenantId).eq('id', campaignId).maybeSingle()
  if (error) throw new Error(`campaign could not be read: ${error.message}`)
  return data ? campaignFromRow(data as unknown as Record<string, unknown>) : null
}

async function insertRows(db: SupabaseClient, rows: readonly Record<string, unknown>[]): Promise<number> {
  let inserted = 0
  for (const group of chunk(rows, INSERT_CHUNK)) {
    const { data, error } = await db.from('sms_outbox')
      .upsert(group, { onConflict: 'tenant_id,family,customer_id,occurrence_key', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`campaign texts could not be queued: ${error.message}`)
    inserted += data?.length ?? 0
  }
  return inserted
}

/** Steps 2 + 3 for an existing run. Safe to repeat: already-queued guests are skipped by the unique key. */
export async function planAndQueueRun(
  db: SupabaseClient, tenantId: string, campaign: CampaignRecord, runId: string, dueAt: Date, now: Date,
): Promise<{ planned: number; queued: number; summary: Record<SkippedReason, number> }> {
  const inputs = await loadAudienceInputs(db, tenantId, now, { excludeRunId: runId })
  const plan = planCampaignRun({
    tenantId, runId, customers: inputs.customers, filter: campaign.audience, template: campaign.messageTemplate,
    store: { storeName: inputs.store.storeName },
    rules: { quietHoursStart: inputs.settings.quietHoursStart, quietHoursEnd: inputs.settings.quietHoursEnd, optOutLine: inputs.settings.optOutLine },
    suppressedPhones: inputs.suppressedPhones, recentlyTextedPhones: inputs.recentlyTextedPhones,
    dueAt, now, expiryMs: campaignExpiryMs(campaign.schedule),
  })
  const queued = await insertRows(db, plan.rows as unknown as Record<string, unknown>[])
  const summary: AudienceSummary = { skipped: plan.summary, filteredOut: plan.filteredOut, reach: plan.rows.length }
  const isEmpty = plan.rows.length === 0
  const { error } = await db.from('sms_campaign_runs').update({
    status: isEmpty ? 'completed' : 'running',
    planned_count: plan.rows.length,
    audience_summary: summary,
    completed_at: isEmpty ? now.toISOString() : null,
    error: null,
  }).eq('tenant_id', tenantId).eq('id', runId).eq('status', 'pending')
  if (error) throw new Error(`campaign run could not be updated: ${error.message}`)
  return { planned: plan.rows.length, queued, summary: plan.summary }
}

interface RunInsert {
  runId: string | null
  isConflict: boolean
}

async function insertPendingRun(db: SupabaseClient, tenantId: string, campaignId: string, options: StartRunOptions): Promise<RunInsert> {
  const { data, error } = await db.from('sms_campaign_runs').insert({
    tenant_id: tenantId, campaign_id: campaignId, due_at: options.dueAt.toISOString(), delivery: 'server',
    trigger: options.trigger, status: 'pending', claimed_by_device: SERVER_DEVICE_LABEL,
    claimed_at: options.now.toISOString(), started_at: options.now.toISOString(),
  }).select('id').single()
  if (error?.code === '23505') return { runId: null, isConflict: true }
  if (error) throw new Error(`campaign run could not be started: ${error.message}`)
  return { runId: (data as { id: string }).id, isConflict: false }
}

async function existingRunFor(db: SupabaseClient, tenantId: string, campaignId: string, dueAt: Date) {
  const { data, error } = await db.from('sms_campaign_runs').select('id, status, due_at, delivery')
    .eq('tenant_id', tenantId).eq('campaign_id', campaignId)
    .or(`due_at.eq.${dueAt.toISOString()},and(delivery.eq.server,status.in.(pending,running))`)
    .order('due_at', { ascending: false }).limit(1)
  if (error) throw new Error(`campaign run could not be read: ${error.message}`)
  return ((data ?? []) as { id: string; status: string }[])[0] ?? null
}

const EMPTY_SUMMARY = (): Record<SkippedReason, number> =>
  ({ no_phone: 0, no_consent: 0, opted_out: 0, suppressed: 0, recently_texted: 0, cannot_fill: 0, over_ceiling: 0 })

export async function startCampaignRun(
  db: SupabaseClient, tenantId: string, campaignId: string, options: StartRunOptions,
): Promise<Outcome<StartRunResult>> {
  const campaign = await readCampaign(db, tenantId, campaignId)
  if (!campaign) return refuse(404, 'That campaign no longer exists.', 'not_found')
  const inserted = await insertPendingRun(db, tenantId, campaignId, options)
  if (inserted.runId) {
    const result = await planAndQueueRun(db, tenantId, campaign, inserted.runId, options.dueAt, options.now)
    return { ok: true, value: { runId: inserted.runId, ...result, isNew: true } }
  }
  const existing = await existingRunFor(db, tenantId, campaignId, options.dueAt)
  if (!existing) return refuse(409, 'This campaign is already sending.', 'already_sending')
  return { ok: true, value: { runId: existing.id, planned: 0, queued: 0, summary: EMPTY_SUMMARY(), isNew: false } }
}

/** Re-plan server runs a crash left `pending`. Returns how many were recovered. */
export async function recoverPendingRuns(db: SupabaseClient, tenantId: string, now: Date): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_PENDING_MS).toISOString()
  const { data, error } = await db.from('sms_campaign_runs').select('id, campaign_id, due_at')
    .eq('tenant_id', tenantId).eq('delivery', 'server').eq('status', 'pending').lt('created_at', staleBefore)
    .order('id').limit(20)
  if (error) throw new Error(`pending campaign runs could not be read: ${error.message}`)
  let recovered = 0
  for (const run of (data ?? []) as { id: string; campaign_id: string; due_at: string }[]) {
    const campaign = await readCampaign(db, tenantId, run.campaign_id)
    if (!campaign) continue
    await planAndQueueRun(db, tenantId, campaign, run.id, new Date(run.due_at), now)
    recovered += 1
  }
  return recovered
}
