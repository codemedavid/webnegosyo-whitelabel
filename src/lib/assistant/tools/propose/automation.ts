/**
 * Owl's SMS automation proposals. Every one is two-phase (Confirm card):
 *   - propose_sms_automation        create or edit one recipe's automation (a new one is saved OFF)
 *   - propose_sms_automation_status switch one on (optionally texting who already qualifies) or off
 *   - propose_run_sms_automation    text everyone who qualifies right now
 * Turning on and running text real guests, so their cards say how many.
 * Validation is the API's own (`normalizeDraft`), so Owl cannot store a
 * message the app's editor would refuse.
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDraft, type NormalizedDraft } from '@/lib/sms-automations/api/schema'
import { previewAutomation } from '@/lib/sms-automations/api/writes'
import { describeAutomation, getRecipe } from '@/lib/sms-automations/recipes'
import { RECIPE_IDS, type RecipeId } from '@/lib/sms-automations/types'
import { readAutomationsView, type AutomationsView } from '@/lib/assistant/tools/reads/automations'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { SmsAutomationPayload, SmsAutomationRunPayload, SmsAutomationStatusPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { ToolResult } from '@/lib/assistant/types'

const recipe = z.enum(RECIPE_IDS).describe('Which automation (one per store per recipe)')
const knob = (what: string) => z.number().int().min(0).max(365).optional().describe(what)

const viewOf = (ctx: AssistantToolContext) => ctx.memo('automations', () => readAutomationsView(ctx.tenantId))

function existingFor(view: AutomationsView, id: RecipeId) {
  return view.automations.find((a) => a.recipe === id) ?? null
}

function cannotRun(view: AutomationsView, id: RecipeId): string | null {
  const definition = getRecipe(id)
  if (definition.needsReviewLink && !view.settings.reviewUrl) return 'The store has no review link saved. Ask the owner to add it in Texts → Texting rules first.'
  if (definition.needsLoyalty && !view.loyaltyOn) return 'Loyalty is off for this store, so this automation cannot run.'
  return null
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

// --- create / edit ----------------------------------------------------------

const saveInput = z.object({
  recipe,
  language: z.enum(['en', 'tl']).optional().describe('Default message language when no message is given (tl = Taglish)'),
  message: z.string().max(459).optional().describe('Message with {{placeholders}}; omit to use the default'),
  inactiveDays: knob('win_back / regulars_gone_quiet: days without an order'),
  delayHours: knob('review_request: hours after the order'),
  delayDays: knob('first_visit / loyalty: days to wait'),
  remainingAtMost: knob('loyalty_almost_there: stamps left'),
  minOrderCount: knob('review / regulars: minimum orders'),
  runMode: z.enum(['auto', 'manual']).optional().describe('auto = sends by itself once on; manual = only when run'),
})
type SaveInput = z.infer<typeof saveInput>

function draftFromInput(request: SaveInput, current: AutomationsView['automations'][number] | null) {
  const definition = getRecipe(request.recipe)
  const knobs = Object.fromEntries(
    (['inactiveDays', 'delayHours', 'delayDays', 'remainingAtMost', 'minOrderCount'] as const)
      .filter((key) => request[key] !== undefined).map((key) => [key, request[key]]),
  )
  const message = request.message
    ?? (request.language ? (request.language === 'tl' ? definition.defaultMessageTl : definition.defaultMessage) : undefined)
    ?? current?.messageTemplate ?? definition.defaultMessage
  return normalizeDraft({
    recipe: request.recipe,
    name: current?.name,
    params: { ...(current?.params ?? {}), ...knobs },
    messageTemplate: message,
    runMode: request.runMode ?? current?.runMode,
    reentryDays: current?.reentryDays ?? null,
  })
}

export const proposeSmsAutomationTool: AssistantToolDef<SaveInput> = {
  name: 'propose_sms_automation',
  description: 'Propose creating or editing the store’s SMS automation for one recipe. New ones are saved Off. The user must confirm.',
  access: { permission: 'customers' },
  input: saveInput,
  async run(ctx, request): Promise<ToolResult> {
    const view = await viewOf(ctx)
    const current = existingFor(view, request.recipe)
    const result = draftFromInput(request, current)
    if (!result.ok) return refused(result.error)
    const payload: SmsAutomationPayload = { draft: result.draft }
    const isLive = current?.status === 'on'
    return fileProposal(ctx, {
      kind: 'sms_automation',
      payload,
      summary: `${current ? 'Update' : 'Set up'} SMS automation "${result.draft.name}"`,
      title: `${current ? 'Update' : 'New'} automation: ${result.draft.name}`,
      lines: [
        { label: 'When', value: describeAutomation(result.draft.recipe, result.draft.params) },
        { label: 'Message', value: result.draft.messageTemplate },
        { label: 'Status', value: current ? (isLive ? 'Stays On' : 'Stays Off') : 'Saved Off — nothing is sent until you turn it on' },
      ],
      warning: isLive ? 'This automation is On: the change applies to the next texts it sends.' : undefined,
    })
  },
}

// --- on / off ---------------------------------------------------------------

const statusInput = z.object({
  recipe,
  status: z.enum(['on', 'off']),
  sendBacklog: z.boolean().optional().describe('Turning on: also text guests who ALREADY qualify (default false)'),
})
type StatusInput = z.infer<typeof statusInput>

function draftOf(automation: AutomationsView['automations'][number]): NormalizedDraft {
  return {
    recipe: automation.recipe, name: automation.name, params: automation.params,
    messageTemplate: automation.messageTemplate, runMode: automation.runMode, reentryDays: automation.reentryDays,
  }
}

async function qualifyingNow(ctx: AssistantToolContext, automation: AutomationsView['automations'][number]): Promise<number> {
  const preview = await previewAutomation(createAdminClient({ timeoutMs: 8000 }), ctx.tenantId, draftOf(automation))
  return preview.now?.queued ?? 0
}

export const proposeSmsAutomationStatusTool: AssistantToolDef<StatusInput> = {
  name: 'propose_sms_automation_status',
  description: 'Propose switching an SMS automation on (optionally texting guests who already qualify) or off. The user must confirm.',
  access: { permission: 'customers' },
  input: statusInput,
  async run(ctx, request): Promise<ToolResult> {
    const view = await viewOf(ctx)
    const automation = existingFor(view, request.recipe)
    if (!automation) return refused('That automation is not set up yet. Propose it with propose_sms_automation first.')
    if (automation.status === request.status) return refused(`It is already ${request.status}.`)
    const sendBacklog = request.status === 'on' && request.sendBacklog === true
    if (request.status === 'on') {
      const blocker = cannotRun(view, automation.recipe)
      if (blocker) return refused(blocker)
      if (sendBacklog && view.sender.enrolled === 0) return refused('No sending phone is set up, so nobody can be texted yet.')
    }
    const backlog = sendBacklog ? await qualifyingNow(ctx, automation) : 0
    const payload: SmsAutomationStatusPayload = { automationId: automation.id, name: automation.name, status: request.status, sendBacklog }
    const lines = request.status === 'off'
      ? [{ label: 'Change', value: 'Stops sending. Texts still waiting are withdrawn.' }]
      : [
          { label: 'Does', value: automation.description },
          { label: 'Right now', value: sendBacklog ? `Texts ${plural(backlog, 'guest', 'guests')} who already qualify` : 'Only guests who qualify from now on' },
        ]
    return fileProposal(ctx, {
      kind: 'sms_automation_status',
      payload,
      summary: `Turn ${request.status} SMS automation "${automation.name}"`,
      title: `Turn ${request.status}: ${automation.name}`,
      lines,
      warning: request.status === 'on' ? 'Texts go to real guests from your sending phone.' : undefined,
    })
  },
}

// --- run now ----------------------------------------------------------------

const runInput = z.object({ recipe })
type RunInput = z.infer<typeof runInput>

export const proposeRunSmsAutomationTool: AssistantToolDef<RunInput> = {
  name: 'propose_run_sms_automation',
  description: 'Propose texting everyone who qualifies for an SMS automation right now. The user must confirm.',
  access: { permission: 'customers' },
  input: runInput,
  async run(ctx, request): Promise<ToolResult> {
    const view = await viewOf(ctx)
    const automation = existingFor(view, request.recipe)
    if (!automation) return refused('That automation is not set up yet. Propose it with propose_sms_automation first.')
    const blocker = cannotRun(view, automation.recipe)
    if (blocker) return refused(blocker)
    if (view.sender.enrolled === 0) return refused('No sending phone is set up, so nobody can be texted yet.')
    const count = await qualifyingNow(ctx, automation)
    if (count === 0) return refused('Nobody qualifies for it right now, so there is nothing to send.')
    const payload: SmsAutomationRunPayload = { automationId: automation.id, name: automation.name }
    return fileProposal(ctx, {
      kind: 'sms_automation_run',
      payload,
      summary: `Text ${count} guests now for "${automation.name}"`,
      title: `Run now: ${automation.name}`,
      lines: [
        { label: 'Texts', value: plural(count, 'guest', 'guests') },
        { label: 'Message', value: automation.messageTemplate },
      ],
      warning: 'Texts go to real guests from your sending phone, paced about 25 every 30 minutes.',
    })
  },
}
