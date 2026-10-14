/**
 * Moving a campaign between live, paused and archived, and handing a phone
 * campaign to the server. Server-only (service role); re-exported by
 * campaign-writes.ts.
 *
 * Pause keeps the open run OPEN and withdraws its waiting texts
 * (`skip_reason='paused'`); Resume puts exactly those back (if they have not
 * expired). Re-planning instead would be blocked by the per-run unique key,
 * and closing the run would let a one-off send to the same guests twice.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSettings } from '@/lib/sms-automations/api/reads'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import { maxEndsOn } from '../campaign-schema'
import { MISSED_AFTER_MS, addManilaDays, manilaInstant, toManilaParts } from '../schedule'
import {
  CHANGED, NOT_FOUND, cancelCampaignWaiting, done, liveProblem, loadCampaignState, quietColumns, refuse, updateOne,
  type CampaignState,
} from './campaign-state'

/** A phone that claimed a run this recently may still be texting from it. */
const PHONE_BUSY_MS = 30 * 60_000
const DEFAULT_REPEAT_WEEKS = 8

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every writer takes (db, tenantId, id, now) so the actions call them alike
export async function pauseCampaign(db: SupabaseClient, tenantId: string, campaignId: string, _now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  if (state.campaign.status === 'paused') return done(null)
  if (state.campaign.status !== 'scheduled' && state.campaign.status !== 'active') {
    return refuse(409, 'Only a live campaign can be paused.', 'not_live')
  }
  if (!(await updateOne(db, tenantId, campaignId, { status: 'paused', pause_reason: 'owner' }, ['scheduled', 'active']))) {
    return refuse(409, CHANGED, 'changed')
  }
  await cancelCampaignWaiting(db, tenantId, state.openRuns.map((run) => run.id), 'paused')
  return done(null)
}

async function requeuePaused(db: SupabaseClient, tenantId: string, runIds: readonly string[], now: Date): Promise<void> {
  if (runIds.length === 0) return
  const { error } = await db.from('sms_outbox').update({ status: 'queued', skip_reason: null })
    .eq('tenant_id', tenantId).in('campaign_run_id', [...runIds]).eq('status', 'cancelled').eq('skip_reason', 'paused')
    .gt('expires_at', now.toISOString())
  if (error) throw new Error(`paused campaign texts could not be put back: ${error.message}`)
}

/** Why a paused server campaign cannot simply resume, or null. */
function resumeProblem(state: CampaignState, now: Date): Outcome<null> | null {
  const { schedule } = state.campaign
  if (schedule.kind === 'one_off' && state.runs.length === 0) {
    const due = schedule.date ? manilaInstant(schedule.date, schedule.time) : null
    if (!due || now.getTime() - due.getTime() > MISSED_AFTER_MS) {
      return refuse(409, "Its start time has passed. Edit it and pick a new time.", 'reschedule')
    }
  }
  if (schedule.kind !== 'one_off' && schedule.endsOn && schedule.endsOn < toManilaParts(now).date) {
    return refuse(409, 'It has ended. Edit it and pick a new end date.', 'ended')
  }
  return null
}

export async function resumeCampaign(db: SupabaseClient, tenantId: string, campaignId: string, now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  const { campaign } = state
  if (campaign.status === 'scheduled' || campaign.status === 'active') return done(null)
  if (campaign.status !== 'paused') return refuse(409, 'Only a paused campaign can be resumed.', 'not_paused')
  if (campaign.delivery === 'phone') {
    return (await updateOne(db, tenantId, campaignId, { status: 'active', pause_reason: null }, ['paused'])) ? done(null) : refuse(409, CHANGED, 'changed')
  }
  const blocked = resumeProblem(state, now)
  if (blocked) return blocked
  if (!(await updateOne(db, tenantId, campaignId, { status: 'scheduled', pause_reason: null, scheduled_from: now.toISOString() }, ['paused']))) {
    return refuse(409, CHANGED, 'changed')
  }
  await requeuePaused(db, tenantId, state.openRuns.map((run) => run.id), now)
  return done(null)
}

export async function archiveCampaign(db: SupabaseClient, tenantId: string, campaignId: string, now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  if (state.campaign.status === 'archived') return done(null)
  if (!(await updateOne(db, tenantId, campaignId, { status: 'archived' }, ['draft', 'scheduled', 'paused', 'active']))) {
    return refuse(409, CHANGED, 'changed')
  }
  const runIds = state.openRuns.map((run) => run.id)
  await cancelCampaignWaiting(db, tenantId, runIds, 'archived')
  if (runIds.length > 0) {
    const { error } = await db.from('sms_campaign_runs').update({ status: 'completed', completed_at: now.toISOString() })
      .eq('tenant_id', tenantId).in('id', runIds).in('status', ['pending', 'running'])
    if (error) throw new Error(`campaign run could not be closed: ${error.message}`)
  }
  return done(null)
}

/** Back as a draft if it never sent, otherwise paused (the owner decides when it goes again). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every writer takes (db, tenantId, id, now) so the actions call them alike
export async function unarchiveCampaign(db: SupabaseClient, tenantId: string, campaignId: string, _now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  if (state.campaign.status !== 'archived') return done(null)
  const fields = state.runs.length > 0 ? { status: 'paused', pause_reason: 'owner' } : { status: 'draft' }
  return (await updateOne(db, tenantId, campaignId, fields, ['archived'])) ? done(null) : refuse(409, CHANGED, 'changed')
}

async function isPhoneMidSend(db: SupabaseClient, tenantId: string, campaignId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - PHONE_BUSY_MS).toISOString()
  const { data, error } = await db.from('sms_campaign_runs').select('id')
    .eq('tenant_id', tenantId).eq('campaign_id', campaignId).eq('status', 'running').gt('claimed_at', since).limit(1)
  if (error) throw new Error(`campaign runs could not be read: ${error.message}`)
  return (data ?? []).length > 0
}

/** Legacy repeats have no end date; the web needs one: 8 weeks, inside the 6-month cap. */
function defaultEndsOn(now: Date): string {
  const eightWeeks = addManilaDays(toManilaParts(now).date, DEFAULT_REPEAT_WEEKS * 7)
  const cap = maxEndsOn(now)
  return eightWeeks < cap ? eightWeeks : cap
}

/** Hand an app (phone) campaign to the server. Nothing before now is caught up. */
export async function switchToAutomatic(db: SupabaseClient, tenantId: string, campaignId: string, now: Date): Promise<Outcome<null>> {
  const state = await loadCampaignState(db, tenantId, campaignId)
  if (!state) return refuse(404, NOT_FOUND, 'not_found')
  const { campaign } = state
  if (campaign.delivery === 'server') return done(null)
  if (campaign.status === 'archived') return refuse(409, 'Unarchive it first.', 'archived')
  if (await isPhoneMidSend(db, tenantId, campaignId, now)) {
    return refuse(409, 'Your phone is sending this one right now. Try again in a few minutes.', 'phone_sending')
  }
  const isRepeat = campaign.schedule.kind !== 'one_off'
  const endsOn = isRepeat ? campaign.schedule.endsOn ?? defaultEndsOn(now) : null
  const settings = await readSettings(db, tenantId)
  const problem = campaign.status === 'draft' ? null : liveProblem({ ...campaign, schedule: { ...campaign.schedule, endsOn } }, settings, now, isRepeat)
  if (problem) return refuse(400, `${problem} Edit it first.`, 'invalid')
  const fields = {
    delivery: 'server', status: campaign.status === 'active' ? 'scheduled' : campaign.status,
    scheduled_from: now.toISOString(), ends_on: endsOn, ...quietColumns(settings),
  }
  return (await updateOne(db, tenantId, campaignId, fields, [campaign.status])) ? done(null) : refuse(409, CHANGED, 'changed')
}
