'use server'

/**
 * Server Actions for /admin/texts (campaigns, sending phones, automatic texts).
 *
 * Every action: `requireTextsAccess` (customers + store-wide) → zod → service
 * role → the server module → `ActionResult`. The page is revalidated only
 * after a write that changes what its lists show. Polling is NOT done here
 * (Next runs a client's actions one at a time): see GET /api/admin/texts/live.
 *
 * No `export type` in this file: a type export from a 'use server' module
 * passes dev and tsc but breaks `next build`. Shapes live in @/lib/texts/types.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Outcome } from '@/lib/sms-automations/api/writes'
import { parseAutomationRequest } from '@/lib/sms-automations/api/schema'
import { dispatchAutomationRequest } from '@/lib/sms-automations/api/http'
import { maskGuestName } from '@/lib/sms-automations/planner'
import { campaignDraftInputSchema, audienceFilterSchema } from '@/lib/texts/campaign-schema'
import { requireTextsAccess, type TextsCaller } from '@/lib/texts/gate'
import { getCampaignReport, previewCampaignAudience } from '@/lib/texts/server/campaign-reads'
import {
  archiveCampaign, deleteCampaignDraft, duplicateCampaign, pauseCampaign, resumeCampaign, saveCampaignDraft,
  scheduleCampaign, sendCampaignNow, switchToAutomatic, unarchiveCampaign, writeCampaignMessages,
} from '@/lib/texts/server/campaign-writes'
import { forgetTextsLive } from '@/lib/texts/server/live'
import { disconnectPhone, renamePhone, MAX_PHONE_LABEL } from '@/lib/texts/server/phones'
import {
  AUDIENCE_PRESETS, type ActionResult, type AudiencePreview, type CampaignDisplayState, type CampaignReport,
} from '@/lib/texts/types'

const log = createLogger('[Texts]', 'DEBUG_SMS_AUTOMATIONS')
const TEXTS_PAGE = '/[tenant]/admin/texts'
const ACTION_QUERY_TIMEOUT_MS = 15_000
/** Previews read a whole store's guests. Shared across instances; an outage lets them through (logged). */
const PREVIEW_LIMIT: RateLimitOptions = { limit: 30, windowSec: 60, onRedisFailure: 'open' }
/** Each "Write it for me" is a paid model call: per person, refused while the limiter is down. */
const WRITE_LIMIT: RateLimitOptions = { limit: 6, windowSec: 60, onRedisFailure: 'refuse' }
/** "Write it for me" calls per store per (UTC) day — the cost ceiling. */
const WRITE_DAILY_STORE_LIMIT = 60
const WRITE_DAY_LIMIT: RateLimitOptions = { limit: WRITE_DAILY_STORE_LIMIT, windowSec: 86_400, onRedisFailure: 'refuse' }
const PREVIEW_BUSY = 'Too many previews. Wait a minute and try again.'
const WRITE_BUSY = 'That’s a lot of drafts — wait a minute and try again.'
const WRITE_DAILY_BUSY = 'Write it for me has been used a lot today. Try again tomorrow, or write your own.'
/** Automation requests that read a whole store (metered like a preview). */
const HEAVY_AUTOMATION_ACTIONS: ReadonlySet<string> = new Set(['preview', 'run_now', 'set_status'])
const AUTOMATION_WRITES: ReadonlySet<string> = new Set(['save', 'set_status', 'run_now', 'save_settings', 'cancel_waiting'])

const tenantIdSchema = z.uuid()
const idSchema = z.uuid()
const NOT_VALID = 'That request is not valid.'
const NOT_ALLOWED = 'You can’t change texts for this store.'
const UNAVAILABLE = 'Something went wrong. Try again.'

type Db = ReturnType<typeof createAdminClient>
type Verb = 'view' | 'edit'

interface Guard<I> {
  schema: z.ZodType<I>
  input: unknown
  verb?: Verb
  ownerOnly?: boolean
  revalidate?: boolean
  /** Which shared rate limit the call counts against. */
  meter?: Meter
}

type Meter = 'preview' | 'write'

/** The refusal for an over-limit call, or null. Shared across serverless instances (Upstash). */
async function meterError(meter: Meter, tenantId: string, userId: string): Promise<string | null> {
  if (meter === 'preview') {
    return (await checkRateLimit(`texts-preview:${userId}`, PREVIEW_LIMIT)).allowed ? null : PREVIEW_BUSY
  }
  if (!(await checkRateLimit(`texts-write:${userId}`, WRITE_LIMIT)).allowed) return WRITE_BUSY
  return (await checkRateLimit(`texts-write-day:${tenantId}`, WRITE_DAY_LIMIT)).allowed ? null : WRITE_DAILY_BUSY
}

type Work<I, T> = (db: Db, tenantId: string, caller: TextsCaller, input: I) => Promise<ActionResult<T>>

const fail = (error: string, code: string): ActionResult<never> => ({ ok: false, error, code })

function fromOutcome<T>(outcome: Outcome<T>): ActionResult<T> {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, error: outcome.error, code: outcome.code }
}

async function authorise(tenantId: string, verb: Verb, ownerOnly: boolean): Promise<TextsCaller | ActionResult<never>> {
  try {
    const caller = await requireTextsAccess(tenantId, verb)
    return ownerOnly && !caller.isOwner ? fail('Only the owner can disconnect a phone.', 'owner_only') : caller
  } catch {
    return fail(NOT_ALLOWED, 'forbidden')
  }
}

/** The one path every action takes. */
async function guarded<I, T>(rawTenantId: unknown, guard: Guard<I>, work: Work<I, T>): Promise<ActionResult<T>> {
  const tenant = tenantIdSchema.safeParse(rawTenantId)
  if (!tenant.success) return fail(NOT_VALID, 'invalid_request')
  const tenantId = tenant.data.toLowerCase()
  const verb = guard.verb ?? 'edit'
  const caller = await authorise(tenantId, verb, guard.ownerOnly ?? false)
  if ('ok' in caller) return caller
  const parsed = guard.schema.safeParse(guard.input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? NOT_VALID, 'invalid')
  const limited = guard.meter ? await meterError(guard.meter, tenantId, caller.userId) : null
  if (limited) return fail(limited, 'rate_limited')
  try {
    const result = await work(createAdminClient({ timeoutMs: ACTION_QUERY_TIMEOUT_MS }), tenantId, caller, parsed.data)
    if (result.ok && guard.revalidate) revalidatePath(TEXTS_PAGE, 'page')
    // The next poll must see the change, not this instance's few-seconds-old view.
    if (result.ok && verb === 'edit') forgetTextsLive(tenantId)
    return result
  } catch (error) {
    log.error('action failed', { tenantId, error: error instanceof Error ? error.message : String(error) })
    return fail(UNAVAILABLE, 'unavailable')
  }
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function saveCampaignAction(tenantId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(tenantId, { schema: campaignDraftInputSchema, input, revalidate: true }, async (db, id, caller, draft) =>
    fromOutcome(await saveCampaignDraft(db, id, caller.userId, draft)))
}

const previewSchema = z.strictObject({ audience: audienceFilterSchema, messageTemplate: z.string().max(2000) })

export async function previewCampaignAudienceAction(tenantId: string, input: unknown): Promise<ActionResult<AudiencePreview>> {
  return guarded(tenantId, { schema: previewSchema, input, verb: 'view', meter: 'preview' }, async (db, id, _caller, draft) =>
    ({ ok: true, value: await previewCampaignAudience(db, id, draft, new Date()) }))
}

export async function scheduleCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<{ displayState: CampaignDisplayState }>> {
  return guarded(tenantId, { schema: idSchema, input: campaignId, revalidate: true }, async (db, id, _caller, campaign) =>
    fromOutcome(await scheduleCampaign(db, id, campaign, new Date())))
}

export async function sendCampaignNowAction(tenantId: string, campaignId: string): Promise<ActionResult<{ queued: number; finishAt: string | null }>> {
  return guarded(tenantId, { schema: idSchema, input: campaignId, revalidate: true }, async (db, id, _caller, campaign) =>
    fromOutcome(await sendCampaignNow(db, id, campaign, new Date())))
}

type CampaignStep = typeof pauseCampaign

function campaignStep(step: CampaignStep) {
  return (tenantId: string, campaignId: string): Promise<ActionResult<null>> =>
    guarded(tenantId, { schema: idSchema, input: campaignId, revalidate: true }, async (db, id, _caller, campaign) =>
      fromOutcome(await step(db, id, campaign, new Date())))
}

export async function pauseCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(pauseCampaign)(tenantId, campaignId)
}

export async function resumeCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(resumeCampaign)(tenantId, campaignId)
}

export async function archiveCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(archiveCampaign)(tenantId, campaignId)
}

export async function unarchiveCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(unarchiveCampaign)(tenantId, campaignId)
}

export async function deleteCampaignDraftAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(deleteCampaignDraft)(tenantId, campaignId)
}

export async function switchToAutomaticAction(tenantId: string, campaignId: string): Promise<ActionResult<null>> {
  return campaignStep(switchToAutomatic)(tenantId, campaignId)
}

export async function duplicateCampaignAction(tenantId: string, campaignId: string): Promise<ActionResult<{ id: string }>> {
  return guarded(tenantId, { schema: idSchema, input: campaignId, revalidate: true }, async (db, id, caller, campaign) =>
    fromOutcome(await duplicateCampaign(db, id, caller.userId, campaign)))
}

const reportSchema = z.strictObject({ campaignId: z.uuid(), cursor: z.string().min(1).max(200).nullable() })

export async function getCampaignReportAction(tenantId: string, campaignId: string, cursor?: string | null): Promise<ActionResult<CampaignReport>> {
  const input = { campaignId, cursor: cursor ?? null }
  return guarded(tenantId, { schema: reportSchema, input, verb: 'view' }, async (db, id, _caller, query) => {
    const report = await getCampaignReport(db, id, query.campaignId, query.cursor, new Date())
    return report ? { ok: true, value: report } : fail('That campaign no longer exists.', 'not_found')
  })
}

const writeSchema = z.strictObject({
  name: z.string().trim().min(1, 'Give it a name first.').max(60),
  audiencePreset: z.enum(AUDIENCE_PRESETS),
  language: z.enum(['en', 'tl']),
})

export async function writeCampaignMessagesAction(tenantId: string, input: unknown): Promise<ActionResult<{ messages: string[] }>> {
  return guarded(tenantId, { schema: writeSchema, input, meter: 'write' }, async (db, id, _caller, request) =>
    fromOutcome(await writeCampaignMessages(db, id, request)))
}

// ─── Sending phones ──────────────────────────────────────────────────────────

const renameSchema = z.strictObject({ deviceId: z.uuid(), label: z.string().trim().min(1, 'Give the phone a name.').max(MAX_PHONE_LABEL) })

/** The phone list comes from the live endpoint: refetch it, nothing to revalidate. */
export async function renamePhoneAction(tenantId: string, deviceId: string, label: string): Promise<ActionResult<null>> {
  return guarded(tenantId, { schema: renameSchema, input: { deviceId, label } }, async (db, id, _caller, phone) =>
    fromOutcome(await renamePhone(db, id, phone.deviceId.toLowerCase(), phone.label)))
}

export async function disconnectPhoneAction(tenantId: string, deviceId: string): Promise<ActionResult<null>> {
  return guarded(tenantId, { schema: idSchema, input: deviceId, ownerOnly: true }, async (db, id, caller, device) =>
    fromOutcome(await disconnectPhone(db, id, caller.userId, device.toLowerCase())))
}

// ─── Automatic texts (the app's POST /api/sms/automations, cookie session) ───

const automationRequestSchema = z.record(z.string(), z.unknown())

function automationMeter(action: string): Meter | null {
  if (action === 'write') return 'write'
  return HEAVY_AUTOMATION_ACTIONS.has(action) ? 'preview' : null
}

/** The web feed names guests like the report does ("Maria S."); the app route keeps full names. */
function withMaskedNames(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.items)) return value
  const items = value.items.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item
    const { guestName } = item as { guestName?: unknown }
    return typeof guestName === 'string' ? { ...item, guestName: maskGuestName(guestName) } : item
  })
  return { ...value, items }
}

/**
 * `request` is exactly the JSON body the app sends to POST /api/sms/automations,
 * minus `tenantId`. The value is the route's JSON minus `success`.
 */
export async function automationsAction(tenantId: string, request: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const action = typeof (request as { action?: unknown } | null)?.action === 'string' ? (request as { action: string }).action : ''
  const verb: Verb = action === 'list' || action === 'activity' ? 'view' : 'edit'
  return guarded(tenantId, { schema: automationRequestSchema, input: request, verb }, async (db, id, caller, body) => {
    const parsed = parseAutomationRequest({ ...body, tenantId: id })
    if (!parsed.success) return fail(NOT_VALID, 'invalid_request')
    const meter = automationMeter(parsed.data.action)
    const limited = meter ? await meterError(meter, id, caller.userId) : null
    if (limited) return fail(limited, 'rate_limited')
    const result = await dispatchAutomationRequest(db, parsed.data, { actorId: caller.userId })
    if (!result.ok) return { ok: false, error: result.error, code: result.code ?? undefined }
    if (AUTOMATION_WRITES.has(parsed.data.action)) revalidatePath(TEXTS_PAGE, 'page')
    const value = parsed.data.action === 'activity' ? withMaskedNames(result.value) : result.value
    return { ok: true, value }
  })
}
