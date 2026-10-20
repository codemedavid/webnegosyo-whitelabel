/**
 * Confirmed Owl proposals for SMS automations. The writers are the API's own
 * (`sms-automations/api/writes.ts`, service role), behind the confirm route's
 * `customers` check — the same boundary the automations route relies on.
 * Every refusal the API would give ("add your review link first", "set up the
 * sending phone first") reaches the owner word for word.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRecipe } from '@/lib/sms-automations/recipes'
import { runAutomationNow, saveAutomation, setAutomationStatus } from '@/lib/sms-automations/api/writes'
import type {
  ExecuteOutcome,
  SmsAutomationPayload,
  SmsAutomationRunPayload,
  SmsAutomationStatusPayload,
} from '@/lib/assistant/actions/kinds'
import type { StoreRef } from '@/lib/assistant/actions/execute-manage'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export async function executeSmsAutomation(store: StoreRef, payload: SmsAutomationPayload, actorId: string): Promise<ExecuteOutcome> {
  const saved = await saveAutomation(createAdminClient(), store.id, actorId, payload.draft, 'ai')
  if (!saved.ok) return { ok: false, error: saved.error }
  const title = getRecipe(payload.draft.recipe).title
  return {
    ok: true,
    message: saved.value.created
      ? `"${title}" is saved and Off. Turn it on when you are ready — nothing is sent until then.`
      : `"${title}" is updated.`,
    resultRef: saved.value.id,
  }
}

export async function executeSmsAutomationStatus(store: StoreRef, payload: SmsAutomationStatusPayload): Promise<ExecuteOutcome> {
  const result = await setAutomationStatus(createAdminClient(), store.id, payload.automationId, payload.status, payload.sendBacklog)
  if (!result.ok) return { ok: false, error: result.error }
  if (payload.status === 'off') {
    return { ok: true, message: `"${payload.name}" is off. Texts that were still waiting were withdrawn.`, resultRef: payload.automationId }
  }
  const queued = result.value.backlog?.queued ?? 0
  return {
    ok: true,
    message: payload.sendBacklog
      ? `"${payload.name}" is on, and ${plural(queued, 'text is', 'texts are')} queued for guests who already qualify.`
      : `"${payload.name}" is on. New guests who qualify will get a text automatically.`,
    resultRef: payload.automationId,
  }
}

export async function executeSmsAutomationRun(store: StoreRef, payload: SmsAutomationRunPayload): Promise<ExecuteOutcome> {
  const result = await runAutomationNow(createAdminClient(), store.id, payload.automationId)
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    message: `${plural(result.value.queued, 'text is', 'texts are')} queued for "${payload.name}". Your phone sends them in the background.`,
    resultRef: payload.automationId,
  }
}
