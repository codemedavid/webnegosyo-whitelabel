/**
 * get_sms_campaigns — the store's SMS campaigns (draft / active / paused), how
 * many texts each sent or failed in 30 days, and how many guests can be texted.
 * Campaign refs let a later turn pause one.
 */

import { z } from 'zod'
import { formatCount } from '@/components/admin/dashboard/dashboard-format'
import { readAssistantCampaigns, type AssistantCampaign, type AssistantCampaigns } from '@/lib/assistant/data/campaigns'
import { SMS_AUDIENCES } from '@/lib/assistant/tools/propose/sms'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'
import type { RefBook } from '@/lib/assistant/refs'
import type { ToolResult } from '@/lib/assistant/types'

const input = z.object({})
type Input = z.infer<typeof input>

const STATUS_LABEL: Record<AssistantCampaign['status'], string> = { draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived' }

function sameAudience(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null))
}

/** The preset's words when the audience is a preset, otherwise "Custom audience". */
export function audienceLabel(audience: Record<string, unknown>): string {
  const preset = Object.values(SMS_AUDIENCES).find((entry) => sameAudience(entry.audience as Record<string, unknown>, audience))
  return preset?.label ?? 'Custom audience'
}

function scheduleLabel(campaign: AssistantCampaign): string {
  if (campaign.scheduleKind === 'one_off') return `Once on ${campaign.scheduleDate ?? '—'}`
  return `Repeats (${campaign.scheduleKind})`
}

export function buildCampaignsResult(data: AssistantCampaigns, refs: RefBook): ToolResult {
  return {
    facts: {
      guestsWhoCanBeTexted: data.reachable ?? 'unavailable',
      campaigns: data.campaigns.map((campaign) => ({
        ref: refs.refFor('campaign', campaign.id),
        name: campaign.name,
        status: campaign.status,
        audience: audienceLabel(campaign.audience),
        schedule: scheduleLabel(campaign),
        sent30d: campaign.sent30d,
        failed30d: campaign.failed30d,
      })),
      ...(data.isSendCountCapped ? { caveat: 'Send counts are a lower bound (very large history).' } : {}),
      note: 'Texts are sent by the merchant app on an Android phone; activating a campaign happens there.',
    },
    card: {
      type: 'ranked',
      title: 'SMS campaigns',
      subtitle: data.reachable === null ? undefined : `${formatCount(data.reachable)} guests can be texted`,
      rows: data.campaigns.map((campaign) => ({
        label: campaign.name,
        value: `${formatCount(campaign.sent30d)} sent`,
        detail: `${audienceLabel(campaign.audience)} · ${scheduleLabel(campaign)}${campaign.failed30d ? ` · ${campaign.failed30d} failed` : ''}`,
        badge: STATUS_LABEL[campaign.status],
      })),
      emptyText: 'No campaigns yet. Ask me to draft one for your slipping regulars.',
    },
    chips: [{ label: 'Draft a win-back text', prompt: 'Draft an SMS to win back my slipping regulars' }],
    links: [{ label: 'Open Customers', path: '/customers' }],
  }
}

export const getSmsCampaignsTool: AssistantToolDef<Input> = {
  name: 'get_sms_campaigns',
  description: 'SMS campaigns (status, audience, schedule, texts sent/failed 30d) and how many guests can be texted.',
  access: { permission: 'customers' },
  input,
  async run(ctx) {
    const data = await ctx.memo('campaigns', () => readAssistantCampaigns(ctx.tenantId))
    return buildCampaignsResult(data, ctx.refs)
  },
}
