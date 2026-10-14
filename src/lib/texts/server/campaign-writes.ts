/**
 * Write side of web Texts campaigns. Server-only — call with the service-role
 * client AFTER `requireTextsAccess` (gate.ts). Every result is an `Outcome`
 * with an owner-readable `error` and a stable `code`.
 *
 * Web campaigns are `delivery='server'` from birth. Going live (schedule /
 * send now) does NOT need a phone (owner decision): the campaign waits, and
 * the tick pauses it (`missed_no_phone`) if no phone shows up within a day.
 * Pause / resume / archive / unarchive / switch live in campaign-status-writes.ts.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { openRouterChat } from '@/lib/ai/openrouter'
import { BOOST_AI_FALLBACK_MODEL, BOOST_AI_MODEL } from '@/lib/boost/ai/prompt'
import { readOutlook, readSettings } from '@/lib/sms-automations/api/reads'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import type { WriteLanguage } from '@/lib/sms-automations/write-copy'
import { deriveDisplayState, dueOf } from '../campaign-view'
import { toManilaParts } from '../schedule'
import type { AudiencePreset, CampaignDisplayState, CampaignDraftInput } from '../types'
import { acceptCampaignMessages, buildCampaignWritePrompt } from '../write-campaign-copy'
import { readPhoneReadiness, readStoreFacts } from './audience-inputs'
import { startCampaignRun } from './campaign-run'
import {
  CHANGED, NOT_FOUND, done, draftProblem, liveProblem, loadCampaignState, quietColumns, refuse, rowFieldsOf, timingProblem, updateOne,
} from './campaign-state'

export {
  archiveCampaign, pauseCampaign, resumeCampaign, switchToAutomatic, unarchiveCampaign,
} from './campaign-status-writes'

const MAX_NAME = 60
const WRITE_TIMEOUT_MS = 20_000
const WRITE_MAX_TOKENS = 600

export async function saveCampaignDraft(
  db: SupabaseClient, tenantId: string, userId: string | null, input: CampaignDraftInput, now: Date = new Date(),
): Promise<Outcome<{ id: string }>> {
  const settings = await readSettings(db, tenantId)
  const problem = draftProblem(input, settings)
  if (problem) return refuse(400, problem, 'invalid')
  const fields = rowFieldsOf(input, settings)
  if (!input.id) {
    const { data, error } = await db.from('sms_campaigns')
      .insert({ ...fields, tenant_id: tenantId, status: 'draft', delivery: 'server', created_by: userId }).select('id').single()
    if (error) throw new Error(`campaign could not be saved: ${error.message}`)
    return done({ id: (data as { id: string }).id })
  }
  const state = await loadCampaignState(db, tenantId, input.id)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  if (state.openRuns.length > 0) return refuse(409, "It's sending right now. Pause it first to change it.", 'already_sending')
  const isLockedOneOff = state.campaign.schedule.kind === 'one_off' && state.runs.length > 0
  if (state.campaign.status === 'archived' || isLockedOneOff) {
    return refuse(409, 'This one already went out. Duplicate it to change it.', 'locked')
  }
  // A live campaign's new time takes effect at once: a past or quiet-hours time would send immediately or wrongly.
  const timing = state.campaign.status === 'scheduled' ? timingProblem(input.schedule, settings, now) : null
  if (timing) return refuse(400, timing, 'invalid')
  const isSaved = await updateOne(db, tenantId, input.id, fields, ['draft', 'scheduled', 'paused', 'active'])
  return isSaved ? done({ id: input.id }) : refuse(409, CHANGED, 'changed')
}

async function displayAfter(db: SupabaseClient, tenantId: string, campaignId: string, now: Date): Promise<CampaignDisplayState> {
  const [state, settings, phones] = await Promise.all([
    loadCampaignState(db, tenantId, campaignId), readSettings(db, tenantId), readPhoneReadiness(db, tenantId, now),
  ])
  if (!state) return 'archived'
  const due = dueOf(state.campaign, state.runs, { start: settings.quietHoursStart, end: settings.quietHoursEnd }, now)
  return deriveDisplayState({
    ...state.campaign, hasAnyRun: state.runs.length > 0, hasOpenRun: state.openRuns.length > 0, isPhoneReady: phones.isReady, due,
  })
}

export async function scheduleCampaign(
  db: SupabaseClient, tenantId: string, campaignId: string, now: Date,
): Promise<Outcome<{ displayState: CampaignDisplayState }>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  const { campaign } = state
  if (campaign.status === 'scheduled') return done({ displayState: await displayAfter(db, tenantId, campaignId, now) })
  if (campaign.status === 'archived') return refuse(409, 'Unarchive it first.', 'archived')
  if (campaign.status === 'active') return refuse(409, 'This one sends from the app. Switch it to automatic sending first.', 'app_managed')
  if (campaign.schedule.kind === 'one_off' && state.runs.length > 0) {
    return refuse(409, 'This one already went out. Duplicate it to send it again.', 'already_sent')
  }
  const settings = await readSettings(db, tenantId)
  const problem = liveProblem(campaign, settings, now)
  if (problem) return refuse(400, problem, 'invalid')
  const fields = { status: 'scheduled', delivery: 'server', pause_reason: null, scheduled_from: now.toISOString(), ...quietColumns(settings) }
  if (!(await updateOne(db, tenantId, campaignId, fields, ['draft', 'paused']))) return refuse(409, CHANGED, 'changed')
  return done({ displayState: await displayAfter(db, tenantId, campaignId, now) })
}

export async function sendCampaignNow(
  db: SupabaseClient, tenantId: string, campaignId: string, now: Date,
): Promise<Outcome<{ queued: number; finishAt: string | null }>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  const { campaign } = state
  if (campaign.status === 'archived') return refuse(409, 'Unarchive it first.', 'archived')
  if (campaign.status === 'active') return refuse(409, 'This one sends from the app. Switch it to automatic sending first.', 'app_managed')
  if (state.openRuns.length > 0) return refuse(409, 'This campaign is already sending.', 'already_sending')
  const isOneOff = campaign.schedule.kind === 'one_off'
  if (isOneOff && state.runs.length > 0) return refuse(409, 'This one already went out. Duplicate it to send it again.', 'already_sent')
  const settings = await readSettings(db, tenantId)
  const problem = liveProblem(campaign, settings, now, false)
  if (problem) return refuse(400, problem, 'invalid')
  const clock = toManilaParts(now)
  const fields = {
    status: 'scheduled', delivery: 'server', pause_reason: null, scheduled_from: now.toISOString(), ...quietColumns(settings),
    ...(isOneOff ? { schedule_date: clock.date, schedule_time: clock.time } : {}),
  }
  if (!(await updateOne(db, tenantId, campaignId, fields, ['draft', 'paused', 'scheduled']))) return refuse(409, CHANGED, 'changed')
  if ((await readPhoneReadiness(db, tenantId, now)).enabledPhones === 0) return done({ queued: 0, finishAt: null })
  const started = await startCampaignRun(db, tenantId, campaignId, { trigger: 'send_now', dueAt: now, now })
  if (!started.ok) return started
  const outlook = await readOutlook(db, tenantId, settings, now)
  return done({ queued: started.value.queued, finishAt: outlook.finishAt })
}

export async function duplicateCampaign(
  db: SupabaseClient, tenantId: string, userId: string | null, campaignId: string,
): Promise<Outcome<{ id: string }>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  const settings = await readSettings(db, tenantId)
  const { campaign } = state
  const fields = rowFieldsOf({ ...campaign, name: `Copy of ${campaign.name}`.slice(0, MAX_NAME) }, settings)
  const { data, error } = await db.from('sms_campaigns')
    .insert({ ...fields, tenant_id: tenantId, status: 'draft', delivery: 'server', created_by: userId }).select('id').single()
  if (error) throw new Error(`campaign could not be copied: ${error.message}`)
  return done({ id: (data as { id: string }).id })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every writer takes (db, tenantId, id, now) so the actions call them alike
export async function deleteCampaignDraft(db: SupabaseClient, tenantId: string, campaignId: string, _now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  if (state.campaign.status !== 'draft' || state.runs.length > 0) {
    return refuse(409, 'Only drafts can be deleted. Archive it instead.', 'not_draft')
  }
  const { data, error } = await db.from('sms_campaigns').delete()
    .eq('tenant_id', tenantId).eq('id', campaignId).eq('status', 'draft').select('id')
  if (error) throw new Error(`campaign could not be deleted: ${error.message}`)
  return (data ?? []).length === 1 ? done(null) : refuse(409, CHANGED, 'changed')
}

export interface WriteCampaignInput {
  name: string
  audiencePreset: AudiencePreset
  language: WriteLanguage
}

/** "Write it for me": up to three messages that passed the gate in write-campaign-copy.ts. */
export async function writeCampaignMessages(
  db: SupabaseClient, tenantId: string, input: WriteCampaignInput,
): Promise<Outcome<{ messages: string[] }>> {
  const { storeName } = await readStoreFacts(db, tenantId)
  const answer = await openRouterChat({
    model: BOOST_AI_MODEL,
    fallbackModel: BOOST_AI_FALLBACK_MODEL,
    messages: buildCampaignWritePrompt({ ...input, storeName }),
    maxTokens: WRITE_MAX_TOKENS,
    temperature: 0.8,
    timeoutMs: WRITE_TIMEOUT_MS,
    title: 'SMS campaign copy',
  })
  const messages = acceptCampaignMessages(answer.content)
  if (messages.length === 0) return refuse(502, 'Couldn’t write one that fits the rules this time. Try again.', 'write_failed')
  return done({ messages })
}
