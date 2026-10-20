/**
 * SmartMenu MCP ops for SMS automations (operator connector; excluded from
 * the merchant connector like SMS campaigns). Loaded lazily by
 * provisioning-ops so the registry stays importable without server-only code.
 *
 * Saving never switches an automation on: a new one is Off, an edit keeps
 * the current status. The validation is the merchant API's own.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRecipe } from './recipes'
import { listAutomationsView } from './api/reads'
import { normalizeDraft } from './api/schema'
import { saveAutomation } from './api/writes'
import type { AutomationParams, RecipeId, RunMode } from './types'

export async function listSmsAutomationsOp(client: SupabaseClient, tenantId: string) {
  const view = await listAutomationsView(client, tenantId)
  const setUp = new Set(view.automations.map((a) => a.recipe))
  return {
    automations: view.automations.map((a) => ({
      recipe: a.recipe, name: a.name, does: a.description, status: a.status, run_mode: a.runMode,
      message_template: a.messageTemplate, sent_30d: a.stats.sent30d, waiting: a.stats.waiting,
    })),
    not_set_up: view.recipes.filter((r) => !setUp.has(r.id)).map((r) => ({
      recipe: r.id, title: r.title, why: r.pitch, placeholders: r.variables, default_message: r.defaultMessage,
    })),
    blockers: [
      ...(view.sender.enrolled === 0 ? ['No sending phone enrolled: nothing can be sent yet.'] : []),
      ...(view.settings.reviewUrl ? [] : ['No review link: review_request cannot run.']),
      ...(view.loyaltyOn ? [] : ['Loyalty off: loyalty_* automations cannot run.']),
    ],
  }
}

export interface SaveSmsAutomationInput {
  tenantId: string
  recipe: RecipeId
  message_template?: string
  params?: AutomationParams
  run_mode?: RunMode
  name?: string
}

export async function saveSmsAutomationOp(client: SupabaseClient, input: SaveSmsAutomationInput) {
  const view = await listAutomationsView(client, input.tenantId)
  const current = view.automations.find((a) => a.recipe === input.recipe) ?? null
  const draft = normalizeDraft({
    recipe: input.recipe,
    name: input.name ?? current?.name,
    params: { ...(current?.params ?? {}), ...(input.params ?? {}) },
    messageTemplate: input.message_template ?? current?.messageTemplate ?? getRecipe(input.recipe).defaultMessage,
    runMode: input.run_mode ?? current?.runMode,
    reentryDays: current?.reentryDays ?? null,
  })
  if (!draft.ok) throw new Error(draft.error)
  const { data: owner } = await client.from('app_users').select('user_id')
    .eq('tenant_id', input.tenantId).eq('is_owner', true).limit(1).maybeSingle()
  const saved = await saveAutomation(client, input.tenantId, (owner as { user_id?: string } | null)?.user_id ?? null, draft.draft, 'ai')
  if (!saved.ok) throw new Error(saved.error)
  return {
    id: saved.value.id,
    created: saved.value.created,
    status: current?.status ?? 'off',
    note: current?.status === 'on'
      ? 'This automation is ON: the change applies to its next texts.'
      : 'Saved Off. The owner turns it on in the merchant app (Reports > Texts).',
  }
}
