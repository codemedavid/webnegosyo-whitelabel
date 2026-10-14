/**
 * get_sms_automations — the store's SMS automations (on/off, what each does,
 * texts sent and waiting), the recipes it has not set up yet, and what stands
 * in the way of sending (no sending phone, no review link, loyalty off).
 *
 * Automations are addressed by RECIPE (a store has at most one per recipe),
 * so no refs are needed to change one later.
 */

import { z } from 'zod'
import { listAutomationsView } from '@/lib/sms-automations/api/reads'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

export type AutomationsView = Awaited<ReturnType<typeof listAutomationsView>>

export async function readAutomationsView(tenantId: string): Promise<AutomationsView> {
  return listAutomationsView(createAdminClient({ timeoutMs: 8000 }), tenantId)
}

function blockers(view: AutomationsView): string[] {
  const found: string[] = []
  if (view.sender.enrolled === 0) found.push('No sending phone is set up yet: texts cannot go out until an Android phone is enrolled in the merchant app.')
  else if (!view.sender.online) found.push('The sending phone is offline right now; texts wait for it.')
  if (!view.settings.reviewUrl) found.push('No review link saved, so review requests cannot run.')
  if (!view.loyaltyOn) found.push('Loyalty is off, so reward and stamp-card automations cannot run.')
  return found
}

export function buildAutomationsResult(view: AutomationsView): ToolResult {
  const setUp = new Set(view.automations.map((a) => a.recipe))
  return {
    facts: {
      automations: view.automations.map((a) => ({
        recipe: a.recipe,
        name: a.name,
        does: a.description,
        status: a.status,
        runs: a.runMode === 'auto' ? 'automatically' : 'only when run by hand',
        sent30d: a.stats.sent30d,
        waiting: a.stats.waiting,
      })),
      notSetUpYet: view.recipes.filter((r) => !setUp.has(r.id)).map((r) => ({ recipe: r.id, title: r.title, why: r.pitch })),
      textsWaiting: view.outlook.waiting,
      sentToday: `${view.outlook.sentToday} of ${view.outlook.dailyLimit} a day`,
      blockers: blockers(view),
      note: 'Turning an automation on or running it texts real guests; both need the owner to confirm.',
    },
    card: {
      type: 'ranked',
      title: 'SMS automations',
      subtitle: view.sender.enrolled === 0 ? 'No sending phone yet' : view.sender.online ? 'Sending phone online' : 'Sending phone offline',
      rows: view.automations.map((a) => ({
        label: a.name,
        value: `${a.stats.sent30d} sent`,
        detail: a.description,
        badge: a.status === 'on' ? 'On' : 'Off',
      })),
      emptyText: 'No automations yet. Ask me to set up a review request or a win-back text.',
    },
    chips: view.automations.length === 0
      ? [{ label: 'Set up a win-back text', prompt: 'Set up an automation to win back guests who stopped ordering' }]
      : [],
  }
}

export const getSmsAutomationsTool: AssistantToolDef<Input> = {
  name: 'get_sms_automations',
  description: 'SMS automations (on/off, what each does, sent 30d, waiting), recipes not set up, and what blocks sending.',
  access: { permission: 'customers' },
  input,
  async run(ctx) {
    return buildAutomationsResult(await ctx.memo('automations', () => readAutomationsView(ctx.tenantId)))
  },
}
