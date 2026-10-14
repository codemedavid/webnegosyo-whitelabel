/**
 * Write side of the automations API. Server-only, service role — the route
 * has already checked the caller's `customers` permission.
 *
 * Results are typed outcomes, not throws, so the route can tell the owner
 * exactly what to do next ("Add your review link first").
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRecipe } from '../recipes'
import { AUTOMATION_COLUMNS, automationFromRow } from '../rows'
import { planSnapshot, runStore } from '../server/run'
import { loadStoreSnapshot } from '../server/snapshot'
import type { AutomationRow, AutomationStatus } from '../types'
import { readLoyaltyOn, readOutlook, readSender, readSettings } from './reads'
import { QUIET_HOURS_FLOOR_ERROR, coversQuietHoursFloor, type NormalizedDraft, type NormalizedSettings } from './schema'
import { openRouterChat } from '@/lib/ai/openrouter'
import { BOOST_AI_FALLBACK_MODEL, BOOST_AI_MODEL } from '@/lib/boost/ai/prompt'
import { acceptWrittenMessages, buildWritePrompt, type WriteLanguage } from '../write-copy'
import type { RecipeId } from '../types'

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string; code?: string }

const refuse = <T>(status: number, error: string, code?: string): Outcome<T> => ({ ok: false, status, error, code })
const SAMPLE_PREVIEW_ID = 'preview'

async function readAutomation(db: SupabaseClient, tenantId: string, id: string): Promise<AutomationRow | null> {
  const { data, error } = await db.from('sms_automations').select(AUTOMATION_COLUMNS)
    .eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (error) throw new Error(`automation: ${error.message}`)
  return data ? automationFromRow(data as Record<string, unknown>) : null
}

/** One automation per recipe per store: saving a recipe again edits it. */
export async function saveAutomation(
  db: SupabaseClient, tenantId: string, actorId: string | null, draft: NormalizedDraft, source: 'owner' | 'ai' | 'onboarding' = 'owner',
): Promise<Outcome<{ id: string; created: boolean }>> {
  const fields = {
    name: draft.name,
    params: draft.params,
    message_template: draft.messageTemplate,
    run_mode: draft.runMode,
    reentry_days: draft.reentryDays,
  }
  const { data: existing, error: readError } = await db.from('sms_automations').select('id')
    .eq('tenant_id', tenantId).eq('recipe', draft.recipe).maybeSingle()
  if (readError) throw new Error(`automation: ${readError.message}`)
  if (existing) {
    const { error } = await db.from('sms_automations').update(fields).eq('tenant_id', tenantId).eq('id', existing.id)
    if (error) throw new Error(`automation could not be saved: ${error.message}`)
    return { ok: true, value: { id: existing.id as string, created: false } }
  }
  const { data, error } = await db.from('sms_automations')
    .insert({ ...fields, tenant_id: tenantId, recipe: draft.recipe, status: 'off', source, created_by: actorId })
    .select('id').single()
  if (error) {
    // Two saves racing for the same recipe: the other one won; edit it instead.
    if (error.code === '23505') return saveAutomation(db, tenantId, actorId, draft, source)
    throw new Error(`automation could not be saved: ${error.message}`)
  }
  return { ok: true, value: { id: data.id as string, created: true } }
}

/** Why this automation cannot run in this store, or null. */
async function blockerFor(db: SupabaseClient, tenantId: string, automation: AutomationRow): Promise<Outcome<never> | null> {
  const recipe = getRecipe(automation.recipe)
  if (recipe.needsReviewLink && !(await readSettings(db, tenantId)).reviewUrl) {
    return refuse(409, 'Add your review link in Texting rules first.', 'missing_review_link')
  }
  if (recipe.needsLoyalty && !(await readLoyaltyOn(db, tenantId))) {
    return refuse(409, 'Turn on your rewards program first.', 'loyalty_off')
  }
  return null
}

async function queueBacklog(db: SupabaseClient, tenantId: string, automationId: string) {
  const result = await runStore(db, tenantId, { mode: 'all', pick: (a) => a.id === automationId, enqueue: true })
  const outlook = await readOutlook(db, tenantId, result.snapshot.settings)
  return { queued: result.queued, report: result.reports.get(automationId) ?? null, outlook }
}

export async function setAutomationStatus(
  db: SupabaseClient, tenantId: string, automationId: string, status: AutomationStatus, sendBacklog: boolean,
): Promise<Outcome<{ status: AutomationStatus; backlog: Awaited<ReturnType<typeof queueBacklog>> | null }>> {
  const automation = await readAutomation(db, tenantId, automationId)
  if (!automation) return refuse(404, 'That automation no longer exists.')
  if (status === 'on') {
    const blocker = await blockerFor(db, tenantId, automation)
    if (blocker) return blocker
    if (sendBacklog && (await readSender(db, tenantId)).enrolled === 0) {
      return refuse(409, 'Set up the phone that sends your texts first.', 'no_sender')
    }
  }
  const { error } = await db.from('sms_automations').update({ status }).eq('tenant_id', tenantId).eq('id', automationId)
  if (error) throw new Error(`automation status: ${error.message}`)
  if (status === 'off') {
    // Off means off: texts still waiting for the phone are withdrawn too.
    await cancelWaiting(db, tenantId, automationId)
    return { ok: true, value: { status, backlog: null } }
  }
  return { ok: true, value: { status, backlog: sendBacklog ? await queueBacklog(db, tenantId, automationId) : null } }
}

export async function runAutomationNow(
  db: SupabaseClient, tenantId: string, automationId: string,
): Promise<Outcome<Awaited<ReturnType<typeof queueBacklog>>>> {
  const automation = await readAutomation(db, tenantId, automationId)
  if (!automation) return refuse(404, 'That automation no longer exists.')
  const blocker = await blockerFor(db, tenantId, automation)
  if (blocker) return blocker
  if ((await readSender(db, tenantId)).enrolled === 0) {
    return refuse(409, 'Set up the phone that sends your texts first.', 'no_sender')
  }
  return { ok: true, value: await queueBacklog(db, tenantId, automationId) }
}

/** Who this (possibly unsaved) automation would text right now, without queueing anything. */
export async function previewAutomation(db: SupabaseClient, tenantId: string, draft: NormalizedDraft) {
  const now = new Date()
  const automation: AutomationRow = {
    id: SAMPLE_PREVIEW_ID, tenant_id: tenantId, recipe: draft.recipe, name: draft.name, params: draft.params,
    message_template: draft.messageTemplate, run_mode: draft.runMode, reentry_days: draft.reentryDays,
    status: 'on', source: 'owner', created_at: now.toISOString(), updated_at: now.toISOString(),
  }
  const snapshot = await loadStoreSnapshot(db, tenantId, [automation], now)
  const backlog = planSnapshot(snapshot, [automation], 'all', now)
  const fresh = planSnapshot(snapshot, [automation], 'fresh', now)
  const textable = snapshot.data.guests.filter((g) =>
    g.phone && g.smsConsent && !g.smsOptOut && !snapshot.suppressedPhones.has(g.phone)).length
  const outlook = await readOutlook(db, tenantId, snapshot.settings, now)
  return {
    audience: { withPhone: snapshot.data.guests.length, textable },
    now: backlog.reports.get(SAMPLE_PREVIEW_ID) ?? null,
    justQualified: fresh.reports.get(SAMPLE_PREVIEW_ID)?.queued ?? 0,
    sampleText: backlog.drafts[0]?.body ?? null,
    outlook,
  }
}

export async function saveSettings(db: SupabaseClient, tenantId: string, settings: NormalizedSettings): Promise<void> {
  // normalizeSettings already refuses this; a caller that skipped it must not narrow the legal window.
  if (!coversQuietHoursFloor(settings.quietHoursStart, settings.quietHoursEnd)) throw new Error(QUIET_HOURS_FLOOR_ERROR)
  const { error } = await db.from('sms_settings').upsert({
    tenant_id: tenantId,
    quiet_hours_start: settings.quietHoursStart,
    quiet_hours_end: settings.quietHoursEnd,
    guest_cap_days: settings.guestCapDays,
    daily_limit: settings.dailyLimit,
    opt_out_line: settings.optOutLine,
    review_url: settings.reviewUrl,
  }, { onConflict: 'tenant_id' })
  if (error) throw new Error(`texting rules could not be saved: ${error.message}`)
}

/** Withdraw texts still waiting for the phone (one automation, or all). */
export async function cancelWaiting(db: SupabaseClient, tenantId: string, automationId?: string): Promise<number> {
  let request = db.from('sms_outbox').update({ status: 'cancelled', skip_reason: 'owner_cancelled' })
    .eq('tenant_id', tenantId).eq('status', 'queued')
  if (automationId) request = request.eq('automation_id', automationId)
  const { data, error } = await request.select('id')
  if (error) throw new Error(`waiting texts could not be cancelled: ${error.message}`)
  return data?.length ?? 0
}

const WRITE_TIMEOUT_MS = 20_000
const WRITE_MAX_TOKENS = 600

/** "Write it for me": up to three messages that passed the gate in write-copy.ts. */
export async function writeMessages(
  db: SupabaseClient, tenantId: string, recipe: RecipeId, language: WriteLanguage,
): Promise<Outcome<{ messages: string[] }>> {
  const { data, error } = await db.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  if (error) throw new Error(`store: ${error.message}`)
  const storeName = (data as { name?: string } | null)?.name ?? 'our store'
  const answer = await openRouterChat({
    model: BOOST_AI_MODEL,
    fallbackModel: BOOST_AI_FALLBACK_MODEL,
    messages: buildWritePrompt({ recipe, language, storeName }),
    maxTokens: WRITE_MAX_TOKENS,
    temperature: 0.8,
    timeoutMs: WRITE_TIMEOUT_MS,
    title: 'SMS automation copy',
  })
  const messages = acceptWrittenMessages(answer.content, recipe)
  if (messages.length === 0) return refuse(502, 'Couldn’t write one that fits the rules this time. Try again.', 'write_failed')
  return { ok: true, value: { messages } }
}
