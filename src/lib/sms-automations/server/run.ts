/**
 * Plan → (optionally) queue, for one store. Server-only.
 *
 * The tick, "Run now" and the preview all come through here, so they apply
 * the same rules to the same data. Queueing is an insert that IGNORES
 * duplicates on the outbox's occurrence key: two runs racing for the same
 * guest produce one text, and the count we report is what was really queued.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { planTexts, type AutomationReport, type PlanMode } from '../planner'
import { getRecipe } from '../recipes'
import type { AutomationRow, OutboxDraft } from '../types'
import { candidatesFor } from '../work'
import { loadStoreSnapshot, readAutomations, type StoreSnapshot } from './snapshot'

const INSERT_CHUNK = 500

export interface StoreRunOptions {
  mode: PlanMode
  /** Which automations to plan; the tick passes the ones switched on and automatic. */
  pick: (automation: AutomationRow) => boolean
  /** false = preview: plan and report, queue nothing. */
  enqueue: boolean
  /** Plan these instead of the stored automations (the editor's unsaved draft). */
  automations?: readonly AutomationRow[]
  now?: Date
}

export interface StoreRunResult {
  snapshot: StoreSnapshot
  reports: Map<string, AutomationReport>
  planned: number
  queued: number
  /** The first planned text, for previews. */
  sampleBody: string | null
}

async function insertDrafts(client: SupabaseClient, drafts: readonly OutboxDraft[]): Promise<number> {
  let inserted = 0
  for (let start = 0; start < drafts.length; start += INSERT_CHUNK) {
    const rows = drafts.slice(start, start + INSERT_CHUNK).map((draft) => ({
      ...draft,
      family: getRecipe(draft.recipe).family,
    }))
    const { data, error } = await client.from('sms_outbox')
      .upsert(rows, { onConflict: 'tenant_id,family,customer_id,occurrence_key', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`texts could not be queued: ${error.message}`)
    inserted += data?.length ?? 0
  }
  return inserted
}

export async function runStore(client: SupabaseClient, tenantId: string, options: StoreRunOptions): Promise<StoreRunResult> {
  const now = options.now ?? new Date()
  const automations = (options.automations ?? await readAutomations(client, tenantId)).filter(options.pick)
  const snapshot = await loadStoreSnapshot(client, tenantId, automations, now)

  const { drafts, reports } = planSnapshot(snapshot, automations, options.mode, now)
  const queued = options.enqueue && drafts.length > 0 ? await insertDrafts(client, drafts) : 0
  return { snapshot, reports, planned: drafts.length, queued, sampleBody: drafts[0]?.body ?? null }
}

/** Plan an already-loaded store (a preview plans one snapshot twice: backlog and fresh). */
export function planSnapshot(snapshot: StoreSnapshot, automations: readonly AutomationRow[], mode: PlanMode, now: Date) {
  return planTexts({
    now,
    mode,
    store: snapshot.store,
    settings: snapshot.settings,
    suppressedPhones: snapshot.suppressedPhones,
    history: snapshot.history,
    work: automations.map((automation) => ({ automation, candidates: candidatesFor(automation, snapshot.data, now) })),
  })
}
