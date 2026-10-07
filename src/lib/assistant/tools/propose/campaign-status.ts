/**
 * propose_pause_sms_campaign — stop an active SMS campaign from sending.
 * Only pausing is offered: (re)activating a campaign texts real guests, and
 * that stays a tap on the owner's own Android phone.
 */

import { z } from 'zod'
import { readAssistantCampaigns } from '@/lib/assistant/data/campaigns'
import { audienceLabel } from '@/lib/assistant/tools/reads/campaigns'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { CampaignStatusPayload } from '@/lib/assistant/actions/kinds'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

const input = z.object({ campaign: z.string().describe('Campaign ref from get_sms_campaigns') })
type Input = z.infer<typeof input>

export const proposePauseSmsCampaignTool: AssistantToolDef<Input> = {
  name: 'propose_pause_sms_campaign',
  description: 'Propose pausing an active SMS campaign so it stops sending. The user must confirm.',
  access: { permission: 'customers' },
  input,
  async run(ctx, request) {
    const campaignId = ctx.refs.resolve(request.campaign, 'campaign')
    if (!campaignId) return refused('Unknown campaign ref. Call get_sms_campaigns first.')
    const data = await ctx.memo('campaigns', () => readAssistantCampaigns(ctx.tenantId))
    const campaign = data.campaigns.find((row) => row.id === campaignId)
    if (!campaign) return refused('That campaign no longer exists.')
    if (campaign.status !== 'active') return refused(`That campaign is ${campaign.status}, not sending. Nothing to pause.`)

    const payload: CampaignStatusPayload = { campaignId: campaign.id, name: campaign.name }
    return fileProposal(ctx, {
      kind: 'campaign_status',
      payload,
      summary: `Pause SMS campaign "${campaign.name}"`,
      title: `Pause SMS: ${campaign.name}`,
      lines: [
        { label: 'To', value: audienceLabel(campaign.audience) },
        { label: 'Change', value: 'Stops sending. Resume it from the merchant app when you are ready.' },
      ],
    })
  },
}
