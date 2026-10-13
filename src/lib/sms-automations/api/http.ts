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

function fromOutcome<T>(outcome: Outcome<T>): NextResponse {
  return outcome.ok
    ? respond({ success: true, ...outcome.value }, 200)
    : respond({ error: outcome.error, code: outcome.code ?? null }, outcome.status)
}

async function dispatch(db: Db, request: AutomationRequest, actorId: string): Promise<NextResponse> {
  const { tenantId } = request
  switch (request.action) {
    case 'list':
      return respond({ success: true, ...await listAutomationsView(db, tenantId) }, 200)
    case 'activity':
      return respond({ success: true, ...await listActivity(db, tenantId, request) }, 200)
    case 'save': {
      const draft = normalizeDraft(request.automation)
      if (!draft.ok) return respond({ error: draft.error, code: 'invalid_message' }, 400)
      return fromOutcome(await saveAutomation(db, tenantId, actorId, draft.draft))
    }
    case 'preview': {
      const draft = normalizeDraft(request.automation)
      if (!draft.ok) return respond({ error: draft.error, code: 'invalid_message' }, 400)
      return respond({ success: true, ...await previewAutomation(db, tenantId, draft.draft) }, 200)
    }
    case 'set_status':
      return fromOutcome(await setAutomationStatus(db, tenantId, request.automationId, request.status, request.sendBacklog ?? false))
    case 'run_now':
      return fromOutcome(await runAutomationNow(db, tenantId, request.automationId))
    case 'save_settings': {
      const settings = normalizeSettings(request.settings)
      if (!settings.ok) return respond({ error: settings.error, code: 'invalid_settings' }, 400)
      await saveSettings(db, tenantId, settings.settings)
      return respond({ success: true, settings: settings.settings }, 200)
    }
    case 'write':
      return fromOutcome(await writeMessages(db, tenantId, request.recipe, request.language))
    case 'cancel_waiting':
      return respond({ success: true, cancelled: await cancelWaiting(db, tenantId, request.automationId) }, 200)
  }
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
  if (HEAVY_ACTIONS.has(parsed.data.action)
    && !checkRateLimit(`sms-automations:${auth.userId}`, HEAVY_LIMIT).allowed) {
    return respond({ error: 'Too many requests. Wait a minute and try again.' }, 429)
  }
  if (parsed.data.action === 'write' && !checkRateLimit(`sms-automations-write:${auth.userId}`, WRITE_LIMIT).allowed) {
    return respond({ error: 'That’s a lot of drafts — wait a minute and try again.' }, 429)
  }

  try {
    return await dispatch(createAdminClient({ timeoutMs: 8000 }), { ...parsed.data, tenantId }, auth.userId)
  } catch (error) {
    log.error('request failed', { tenantId, action: parsed.data.action, error: error instanceof Error ? error.message : String(error) })
    return unavailable(UNAVAILABLE)
  }
}
