/**
 * POST /api/sms/automations — the merchant app's (and later Owl's/the web's)
 * one door to automations. Bearer session → store member with the
 * `customers` permission, store-wide accounts only (a branch account texting
 * the whole store's guests is out of its scope). Server-only.
 */

import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { hasPermission } from '@/lib/staff-permissions'
import { authenticateMerchant, readBody, respond, unavailable } from '@/lib/loyalty/merchant-http'
import { listActivity, listAutomationsView } from './reads'
import { normalizeDraft, normalizeSettings, parseAutomationRequest, type AutomationRequest } from './schema'
import { cancelWaiting, previewAutomation, runAutomationNow, saveAutomation, saveSettings, setAutomationStatus, writeMessages, type Outcome } from './writes'

const log = createLogger('[SMS Automations]', 'DEBUG_SMS_AUTOMATIONS')
const UNAVAILABLE = 'Texts could not be loaded. Try again.'
/** Previews and runs read a whole store; this is a per-instance brake, not a quota. */
const HEAVY_ACTIONS = new Set(['preview', 'run_now', 'set_status'])
const HEAVY_LIMIT = { maxRequests: 30, windowMs: 60_000 }
/** Each "Write it for me" is a paid model call. */
const WRITE_LIMIT = { maxRequests: 6, windowMs: 60_000 }

type Db = ReturnType<typeof createAdminClient>

/** What one automations request answers: the route's JSON body minus `success`, or a refusal. */
export type AutomationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; error: string; code: string | null }

export interface AutomationCaller {
  /** The signed-in member acting (recorded as the creator of new automations). */
  actorId: string
}

const answer = (value: object): AutomationResult => ({ ok: true, value: { ...value } })
const refuse = (status: number, error: string, code: string | null): AutomationResult => ({ ok: false, status, error, code })

function fromOutcome<T extends object>(outcome: Outcome<T>): AutomationResult {
  return outcome.ok ? answer(outcome.value) : refuse(outcome.status, outcome.error, outcome.code ?? null)
}

/**
 * One parsed request, run against the store in `request.tenantId`. Shared by
 * this route (bearer session) and the web's `automationsAction` (cookie
 * session); each checks its caller before calling it.
 */
export async function dispatchAutomationRequest(db: Db, request: AutomationRequest, caller: AutomationCaller): Promise<AutomationResult> {
  const { tenantId } = request
  switch (request.action) {
    case 'list':
      return answer(await listAutomationsView(db, tenantId))
    case 'activity':
      return answer(await listActivity(db, tenantId, request))
    case 'save': {
      const draft = normalizeDraft(request.automation)
      if (!draft.ok) return refuse(400, draft.error, 'invalid_message')
      return fromOutcome(await saveAutomation(db, tenantId, caller.actorId, draft.draft))
    }
    case 'preview': {
      const draft = normalizeDraft(request.automation)
      if (!draft.ok) return refuse(400, draft.error, 'invalid_message')
      return answer(await previewAutomation(db, tenantId, draft.draft))
    }
    case 'set_status':
      return fromOutcome(await setAutomationStatus(db, tenantId, request.automationId, request.status, request.sendBacklog ?? false))
    case 'run_now':
      return fromOutcome(await runAutomationNow(db, tenantId, request.automationId))
    case 'save_settings': {
      const settings = normalizeSettings(request.settings)
      if (!settings.ok) return refuse(400, settings.error, 'invalid_settings')
      await saveSettings(db, tenantId, settings.settings)
      return answer({ settings: settings.settings })
    }
    case 'write':
      return fromOutcome(await writeMessages(db, tenantId, request.recipe, request.language))
    case 'cancel_waiting':
      return answer({ cancelled: await cancelWaiting(db, tenantId, request.automationId) })
  }
}

/** The per-person brake on expensive actions, or null when the request may run. */
export function automationRateLimitError(action: AutomationRequest['action'], actorId: string): string | null {
  if (HEAVY_ACTIONS.has(action) && !checkRateLimit(`sms-automations:${actorId}`, HEAVY_LIMIT).allowed) {
    return 'Too many requests. Wait a minute and try again.'
  }
  if (action === 'write' && !checkRateLimit(`sms-automations-write:${actorId}`, WRITE_LIMIT).allowed) {
    return 'That’s a lot of drafts — wait a minute and try again.'
  }
  return null
}

function toResponse(result: AutomationResult): NextResponse {
  return result.ok
    ? respond({ success: true, ...result.value }, 200)
    : respond({ error: result.error, code: result.code }, result.status)
}

export async function handleSmsAutomations(request: NextRequest): Promise<NextResponse> {
  const body = await readBody(request)
  if (body instanceof Response) return body as NextResponse
  const parsed = parseAutomationRequest(body)
  if (!parsed.success) return respond({ error: 'That request is not valid.', code: 'invalid_request' }, 400)
  const tenantId = parsed.data.tenantId.toLowerCase()

  const auth = await authenticateMerchant(request, tenantId)
  if (!auth.ok) return auth.response
  if (!hasPermission(auth.member, 'customers') || auth.member.outlet_id) return respond({ error: 'Forbidden' }, 403)
  const limited = automationRateLimitError(parsed.data.action, auth.userId)
  if (limited) return respond({ error: limited }, 429)

  try {
    const db = createAdminClient({ timeoutMs: 8000 })
    return toResponse(await dispatchAutomationRequest(db, { ...parsed.data, tenantId }, { actorId: auth.userId }))
  } catch (error) {
    log.error('request failed', { tenantId, action: parsed.data.action, error: error instanceof Error ? error.message : String(error) })
    return unavailable(UNAVAILABLE)
  }
}
