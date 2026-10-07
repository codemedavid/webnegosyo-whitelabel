/**
 * get_loyalty — the store's stamp/points programs (rules, status), how members
 * stand (reward ready, almost there, dormant) and 30 days of activity. Each
 * program carries a ref so a later turn can edit, start or pause it.
 */

import { z } from 'zod'
import { formatCount } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantLoyalty, type AssistantLoyalty } from '@/lib/assistant/data/loyalty'
import { describeEarning, describeExpiry, describeRewards } from '@/lib/assistant/insights/loyalty-rules'
import { maskCustomerName } from '@/lib/assistant/insights/customer-label'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

const STATUS_LABEL = { draft: 'Draft', active: 'Live', paused: 'Paused', ended: 'Ended' } as const

export function buildLoyaltyResult(loyalty: AssistantLoyalty, refs: RefBook): ToolResult {
  const programs = loyalty.programs.filter((program) => program.status !== 'ended')
  if (programs.length === 0) {
    return {
      facts: { hasProgram: false, note: 'No loyalty program yet. propose_loyalty_program can draft one.' },
      card: { type: 'stats', title: 'Loyalty', subtitle: 'No program yet', items: [{ label: 'Programs', value: '0' }] },
      chips: [{ label: 'Set up a stamp card', prompt: 'Set up a stamp card for my store' }],
      links: [{ label: 'Open Loyalty', path: '/loyalty' }],
    }
  }

  const { totals, last30Days } = loyalty
  return {
    facts: {
      hasProgram: true,
      storeEarningLive: loyalty.isLive,
      programs: programs.map((program) => ({
        ref: refs.refFor('program', program.id),
        name: program.name,
        status: program.status,
        ...(program.rules
          ? { earning: describeEarning(program.rules), rewards: describeRewards(program.rules), expiry: describeExpiry(program.rules) }
          : { rules: 'unreadable' }),
        members: program.members,
        rewardsWaitingToBeClaimed: program.rewardsOutstanding,
      })),
      members: totals ?? 'unavailable',
      last30Days: last30Days ?? 'unavailable',
      nearReward: loyalty.nearReward.map((member) => ({
        name: maskCustomerName(member.name),
        status: member.status,
        remaining: member.headline?.remaining ?? null,
      })),
    },
    card: {
      type: 'stats',
      title: programs.length === 1 ? programs[0].name : 'Loyalty',
      subtitle: programs.map((program) => `${STATUS_LABEL[program.status]}${program.rules ? ` · ${describeRewards(program.rules)}` : ''}`).join(' | '),
      items: [
        { label: 'Members', value: totals ? formatCount(totals.total) : '—', hint: totals ? `${formatCount(totals.dormant)} dormant` : undefined },
        { label: 'Reward ready', value: totals ? formatCount(totals.rewardReady) : '—', hint: totals ? `${formatCount(totals.almostThere)} almost there` : undefined },
        { label: 'Earning visits (30d)', value: last30Days ? formatCount(last30Days.earningVisits) : '—' },
        { label: 'Rewards redeemed (30d)', value: last30Days ? formatCount(last30Days.rewardsRedeemed) : '—', hint: last30Days ? `${formatCount(last30Days.rewardsIssued)} earned` : undefined },
      ],
    },
    chips: [
      { label: 'Bring dormant members back', prompt: 'How do I bring my dormant loyalty members back?' },
      ...(programs.some((program) => program.status !== 'active') ? [{ label: 'Go live', prompt: 'Turn on my loyalty program' }] : []),
    ],
    links: [{ label: 'Open Loyalty', path: '/loyalty' }],
  }
}

export const getLoyaltyTool: AssistantToolDef<Input> = {
  name: 'get_loyalty',
  description: 'Loyalty programs (rules, status), member standing and 30-day stamps/rewards.',
  access: { permission: 'loyalty_manage' },
  input,
  async run(ctx) {
    const loyalty = await ctx.memo('loyalty', () => readAssistantLoyalty(ctx.tenantId))
    return buildLoyaltyResult(loyalty, ctx.refs)
  },
}
