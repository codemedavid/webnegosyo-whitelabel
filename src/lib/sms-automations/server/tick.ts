/**
 * The 5-minute cron: for every store with an automatic automation switched ON
 * and a sender phone enrolled, sweep stale outbox rows and queue the texts of
 * guests who JUST started to qualify (`fresh` mode — the backlog is the
 * owner's call, via Run now). Server-only.
 *
 * A store without an enrolled phone is skipped on purpose: a queued text
 * burns its occurrence, so queueing for a phone that does not exist would
 * quietly use up those guests' one text.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'
import type { AutomationRow } from '../types'
import { runStore } from './run'
import { alertWaitingTexts } from './waiting-alert'

const log = createLogger('[SMS Automations]', 'DEBUG_SMS_AUTOMATIONS')
const PAGE_SIZE = 1000
/** Leave room under the route's maxDuration for the stores already started. */
const DEFAULT_BUDGET_MS = 45_000
/** vercel.json schedules the tick every 5 minutes. */
const TICK_INTERVAL_MS = 5 * 60_000

export const isAutomaticAndOn = (automation: AutomationRow): boolean =>
  automation.status === 'on' && automation.run_mode === 'auto'

export interface TickSummary {
  stores: number
  processed: number
  queued: number
  failed: number
  /** Stores left for the next tick because the time budget ran out. */
  deferred: number
}

async function readDistinctTenants(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: { tenant_id: string }[] | null; error: { message: string } | null }>,
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} could not be read: ${error.message}`)
    for (const row of data ?? []) ids.add(row.tenant_id)
    if (!data || data.length < PAGE_SIZE) return ids
  }
}

/**
 * Stores with at least one automatic automation on AND an enabled sender
 * phone. Both lists are paged and intersected here: an `in (...)` of every
 * store id would outgrow the request URL as stores turn automations on.
 */
export async function storesDueForTick(client: SupabaseClient): Promise<string[]> {
  const withAutomations = await readDistinctTenants('automations', (from, to) => client.from('sms_automations')
    .select('tenant_id').eq('status', 'on').eq('run_mode', 'auto').order('tenant_id').range(from, to))
  if (withAutomations.size === 0) return []
  const withSender = await readDistinctTenants('sender phones', (from, to) => client.from('loyalty_sms_devices')
    .select('tenant_id').eq('enabled', true).order('tenant_id').range(from, to))
  return [...withAutomations].filter((id) => withSender.has(id)).sort()
}

export interface TickDeps {
  client: SupabaseClient
  now?: () => Date
  budgetMs?: number
  /** Seam for tests. */
  runOne?: (tenantId: string) => Promise<number>
}

async function runOneStore(client: SupabaseClient, tenantId: string, now: Date): Promise<number> {
  const { error } = await client.rpc('sweep_sms_outbox', { p_tenant_id: tenantId })
  if (error) throw new Error(`outbox sweep failed: ${error.message}`)
  const result = await runStore(client, tenantId, { mode: 'fresh', pick: isAutomaticAndOn, enqueue: true, now })
  // Texts piling up behind a silent phone: tell the owner. A failed alert never fails the store's run.
  await alertWaitingTexts(client, tenantId, now).catch((alertError: unknown) => {
    log.error('waiting-texts alert failed', { tenantId, error: alertError instanceof Error ? alertError.message : String(alertError) })
  })
  return result.queued
}

export async function runAutomationTick({ client, now = () => new Date(), budgetMs = DEFAULT_BUDGET_MS, runOne }: TickDeps): Promise<TickSummary> {
  const started = Date.now()
  const due = await storesDueForTick(client)
  // Rotate the start so a slow store never starves the same stores behind it every tick.
  const offset = due.length === 0 ? 0 : Math.floor(now().getTime() / TICK_INTERVAL_MS) % due.length
  const tenants = [...due.slice(offset), ...due.slice(0, offset)]
  const run = runOne ?? ((tenantId: string) => runOneStore(client, tenantId, now()))
  const summary: TickSummary = { stores: tenants.length, processed: 0, queued: 0, failed: 0, deferred: 0 }

  for (const tenantId of tenants) {
    if (Date.now() - started > budgetMs) {
      summary.deferred = tenants.length - summary.processed - summary.failed
      break
    }
    try {
      summary.queued += await run(tenantId)
      summary.processed += 1
    } catch (error) {
      summary.failed += 1
      log.error('store tick failed', { tenantId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  log.debug('tick finished', { ...summary })
  return summary
}
