/**
 * Ready-made SMS automations for a brand-new store, saved OFF.
 *
 * They replace the old repeating "follow-up" campaign drafts: an automation
 * texts each guest once, at the right moment (5 days after a first visit, when
 * a regular goes quiet, after 30 quiet days), where a repeating blast texted
 * the same list again every week. Off means nothing is sent until the owner
 * turns one on in the app's Texts screen. The first-timer text names the
 * stamp-card reward when it texts cleanly (same rule as the launch campaigns).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeDraft, type NormalizedDraft } from '@/lib/sms-automations/api/schema'
import { getRecipe } from '@/lib/sms-automations/recipes'
import type { RecipeId } from '@/lib/sms-automations/types'

export interface LaunchAutomationOptions {
  /** "Free Spanish Latte"; null when the store has no stamp card. */
  rewardLabel: string | null
  threshold: number | null
}

/** Plain letters only: anything else makes the text a costlier UCS-2 message. */
const PLAIN_TEXT = /^[A-Za-z0-9 .,'&!()-]+$/
const MAX_REWARD_TEXT = 30

/** In order, with when each one texts: the reveal lists them. */
export const LAUNCH_AUTOMATIONS: readonly { recipe: RecipeId; name: string; when: string }[] = [
  { recipe: 'first_visit_followup', name: 'Invite first-timers back', when: '5 days after their first order' },
  { recipe: 'regulars_gone_quiet', name: 'Nudge slipping regulars', when: 'When a regular goes quiet for 3 weeks' },
  { recipe: 'win_back', name: 'Win back lapsed guests', when: 'After 30 quiet days' },
]

function rewardSentence({ rewardLabel, threshold }: LaunchAutomationOptions): string | null {
  const reward = rewardLabel?.trim()
  if (!reward || !threshold || reward.length > MAX_REWARD_TEXT || !PLAIN_TEXT.test(reward)) return null
  return `Order again and collect stamps: ${threshold} orders = ${reward}.`
}

export function buildLaunchAutomations(options: LaunchAutomationOptions): NormalizedDraft[] {
  const reward = rewardSentence(options)
  return LAUNCH_AUTOMATIONS.map(({ recipe, name }) => {
    const message = recipe === 'first_visit_followup' && reward
      ? `Hi {{firstName}}, thanks for trying {{storeName}}! ${reward} {{menuLink}}`
      : getRecipe(recipe).defaultMessage
    const result = normalizeDraft({ recipe, name, messageTemplate: message })
    // The registry's own defaults always validate (recipes.test.ts); a failure here is a code bug.
    if (!result.ok) throw new Error(`launch automation ${recipe}: ${result.error}`)
    return result.draft
  })
}

/**
 * Save the automations a store does not have yet (one per recipe), Off, so a
 * retried build never saves one twice. Returns how many the store now has.
 */
export async function draftLaunchAutomations(
  admin: SupabaseClient,
  tenantId: string,
  options: LaunchAutomationOptions,
): Promise<{ drafted: number }> {
  const drafts = buildLaunchAutomations(options)
  const { data, error } = await admin.from('sms_automations').select('recipe').eq('tenant_id', tenantId)
  if (error) throw new Error(`Automations could not be read: ${error.message}`)
  const existing = new Set(((data ?? []) as Array<{ recipe: string }>).map((row) => row.recipe))
  const missing = drafts.filter((draft) => !existing.has(draft.recipe))
  if (missing.length > 0) {
    const { error: insertError } = await admin.from('sms_automations').upsert(missing.map((draft) => ({
      tenant_id: tenantId,
      recipe: draft.recipe,
      name: draft.name,
      params: draft.params,
      message_template: draft.messageTemplate,
      run_mode: draft.runMode,
      reentry_days: draft.reentryDays,
      status: 'off',
      source: 'onboarding',
    })), { onConflict: 'tenant_id,recipe', ignoreDuplicates: true })
    if (insertError) throw new Error(`Automations could not be saved: ${insertError.message}`)
  }
  return { drafted: drafts.length }
}
