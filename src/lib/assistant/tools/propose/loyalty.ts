/**
 * Loyalty proposals, validated by the SAME rules the Loyalty screen uses
 * (`parseLoyaltyRules`, `resolveProgramCatalog`, `programStatusPatch`).
 *
 * - propose_loyalty_program drafts a new stamp card, or edits an existing
 *   program's rules (a new version; already-issued rewards keep their terms).
 *   A new program is always a DRAFT: nothing earns until it goes live.
 * - propose_loyalty_status starts or pauses a program. Ending one is
 *   permanent, so the assistant never offers it.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLoyaltyRules } from '@/lib/loyalty/rules'
import { resolveProgramCatalog } from '@/lib/loyalty/program-catalog'
import { canTransitionProgram } from '@/lib/loyalty/manage'
import type { LoyaltyRules } from '@/lib/loyalty/types'
import { readAssistantLoyalty } from '@/lib/assistant/data/loyalty'
import { describeEarning, describeExpiry, describeRewards } from '@/lib/assistant/insights/loyalty-rules'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { LoyaltyProgramPayload, LoyaltyStatusPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolContext, AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'

const reward = z.object({
  type: z.enum(['fixed', 'percent', 'free_item']),
  amount: z.number().positive().nullable().describe('₱ off, for fixed'),
  percent: z.number().positive().max(100).nullable().describe('For percent'),
  maxAmount: z.number().positive().nullable().describe('Cap for percent'),
  item: z.string().nullable().describe('Item ref, for free_item'),
})
type RewardInput = z.infer<typeof reward>

const programInput = z.object({
  program: z.string().nullable().describe('Program ref to edit; null = draft a new stamp card'),
  name: z.string().trim().min(2).max(80).nullable().describe('Required for a new program'),
  stampsForReward: z.number().int().min(2).max(50),
  minSpend: z.number().min(0).nullable().describe('Order total needed to earn a stamp'),
  reward,
  milestones: z.array(z.object({ at: z.number().int().positive(), reward })).max(3).nullable().describe('Smaller rewards part-way, e.g. at stamp 5'),
  rewardExpiryDays: z.number().int().positive().max(365).nullable().describe('null = never'),
})
type ProgramInput = z.infer<typeof programInput>

function toReward(input: RewardInput, refs: RefBook): unknown {
  if (input.type === 'fixed') return { type: 'fixed', amount: input.amount }
  if (input.type === 'percent') return { type: 'percent', percent: input.percent, maxAmount: input.maxAmount }
  const id = input.item ? refs.resolve(input.item, 'item') : null
  // The catalog check fills in the real name and photo.
  return id ? { type: 'free_item', menuItemId: id, itemName: '' } : null
}

async function validRules(ctx: AssistantToolContext, raw: Record<string, unknown>): Promise<LoyaltyRules | string> {
  const parsed = parseLoyaltyRules(raw)
  if (!parsed.ok) return parsed.error
  const catalog = await resolveProgramCatalog(createAdminClient() as unknown as SupabaseClient, ctx.tenantId, parsed.value)
  return 'error' in catalog ? catalog.error : catalog.rules
}

export const proposeLoyaltyProgramTool: AssistantToolDef<ProgramInput> = {
  name: 'propose_loyalty_program',
  description: 'Propose a new stamp-card program (saved as a draft) or new rules for an existing one (program ref). The user must confirm.',
  access: { permission: 'loyalty_manage' },
  input: programInput,
  async run(ctx, request) {
    const rewards = [request.reward, ...(request.milestones ?? []).map((m) => m.reward)].map((r) => toReward(r, ctx.refs))
    if (rewards.some((r) => r === null)) return refused('A free-item reward needs an item ref. Use search_menu first.')

    const loyalty = await ctx.memo('loyalty', () => readAssistantLoyalty(ctx.tenantId))
    const existing = request.program ? loyalty.programs.find((p) => p.id === ctx.refs.resolve(request.program ?? '', 'program')) : null
    if (request.program && !existing) return refused('Unknown program ref. Call get_loyalty first.')
    if (existing?.status === 'ended') return refused('That program has ended and cannot be edited. Draft a new one instead.')
    if (!existing && !request.name) return refused('A new program needs a name.')
    if (!existing && loyalty.programs.some((p) => p.status === 'active' || p.status === 'draft' || p.status === 'paused')) {
      return refused('This store already has a program. Edit it (pass its ref) instead of drafting a second one.')
    }

    const earnMode = existing?.earnMode ?? 'stamp'
    const rules = await validRules(ctx, {
      earnMode,
      threshold: request.stampsForReward,
      pointsPerPeso: earnMode === 'points' ? existing?.rules?.pointsPerPeso ?? null : null,
      minSpend: request.minSpend,
      reward: rewards[0],
      milestones: (request.milestones ?? []).map((m, index) => ({ at: m.at, reward: rewards[index + 1] })),
      rewardExpiryDays: request.rewardExpiryDays,
      isExclusive: existing?.rules?.isExclusive ?? true,
    })
    if (typeof rules === 'string') return refused(rules)

    const lines = [
      { label: 'Earning', value: describeEarning(rules) },
      { label: 'Rewards', value: describeRewards(rules) },
      { label: 'Expiry', value: describeExpiry(rules) },
    ]
    if (existing) {
      const payload: LoyaltyProgramPayload = { mode: 'revise', programId: existing.id, name: existing.name, rules, expectedVersion: existing.versionNumber }
      return fileProposal(ctx, {
        kind: 'loyalty_program',
        payload,
        summary: `New rules for loyalty program "${existing.name}"`,
        title: `Update ${existing.name}`,
        lines: existing.rules ? [{ label: 'Now', value: describeRewards(existing.rules) }, ...lines] : lines,
        warning: existing.status === 'active'
          ? 'Applies to visits from now on. Rewards already earned keep their old terms.'
          : 'Saved to the program; it starts earning only once it is live.',
      })
    }

    const name = request.name as string
    const payload: LoyaltyProgramPayload = {
      mode: 'create',
      input: { name, description: null, earnMode: 'stamp', scope: 'business', outletId: null, rules, activatesAt: null, endsAt: null },
    }
    return fileProposal(ctx, {
      kind: 'loyalty_program',
      payload,
      summary: `Draft loyalty program "${name}"`,
      title: `New stamp card: ${name}`,
      lines,
      warning: 'Saved as a draft. Customers earn nothing until you make it live.',
    })
  },
}

const statusInput = z.object({
  program: z.string().describe('Program ref from get_loyalty'),
  status: z.enum(['active', 'paused']).describe('active = go live / resume'),
})
type StatusInput = z.infer<typeof statusInput>

export const proposeLoyaltyStatusTool: AssistantToolDef<StatusInput> = {
  name: 'propose_loyalty_status',
  description: 'Propose making a loyalty program live (or resuming it) or pausing it. The user must confirm.',
  access: { permission: 'loyalty_manage' },
  input: statusInput,
  async run(ctx, request) {
    const loyalty = await ctx.memo('loyalty', () => readAssistantLoyalty(ctx.tenantId))
    const programId = ctx.refs.resolve(request.program, 'program')
    const program = loyalty.programs.find((p) => p.id === programId)
    if (!program) return refused('Unknown program ref. Call get_loyalty first.')
    if (program.status === 'ended') return refused('That program has ended. Draft a new one instead.')
    if (program.status === request.status) return refused(`That program is already ${request.status === 'active' ? 'live' : 'paused'}.`)
    if (!canTransitionProgram(program.status, request.status)) return refused(`A ${program.status} program cannot be ${request.status}.`)
    if (request.status === 'active' && !program.rules) return refused('That program has no readable rules yet. Edit its rules first.')

    const payload: LoyaltyStatusPayload = { programId: program.id, name: program.name, to: request.status, expectedStatus: program.status }
    const goingLive = request.status === 'active'
    const isFirstStart = goingLive && program.status === 'draft'
    return fileProposal(ctx, {
      kind: 'loyalty_status',
      payload,
      summary: `${goingLive ? (isFirstStart ? 'Go live with' : 'Resume') : 'Pause'} loyalty program "${program.name}"`,
      title: goingLive ? `${isFirstStart ? 'Go live' : 'Resume'}: ${program.name}` : `Pause ${program.name}`,
      lines: [
        ...(program.rules ? [{ label: 'Rewards', value: describeRewards(program.rules) }] : []),
        { label: 'Change', value: goingLive ? 'Customers start earning on completed orders' : 'No new stamps; earned rewards stay claimable' },
      ],
      warning: isFirstStart
        ? 'Turns loyalty on for your store. Orders completed before now never earn.'
        : goingLive
          ? 'Customers earn again from the moment you confirm.'
          : undefined,
    })
  },
}
