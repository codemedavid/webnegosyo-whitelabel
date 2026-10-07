/**
 * propose_sms_campaign — an SMS campaign saved as a DRAFT. Sending is the
 * merchant's Android handset's job and a draft never becomes due, so even a
 * confirmed proposal texts nobody until the owner activates it in the app.
 */

import { z } from 'zod'
import { smsCampaignDraftSchema } from '@/lib/sms-campaign-draft'
import { estimateSmsSegments } from '@/lib/assistant/insights/sms-segments'
import { fileProposal, refused } from '@/lib/assistant/tools/propose/shared'
import type { AssistantToolDef } from '@/lib/assistant/tools/registry'

/** Ported from webnegosyo-app/lib/sms/campaign-presets.ts (audience part only). */
export const SMS_AUDIENCES = {
  lapsed: { label: 'Guests quiet for 3+ weeks', audience: { lastOrderOlderThanDays: 21 } },
  slipping_regulars: { label: 'Regulars (2+ orders) quiet for 2+ weeks', audience: { minOrderCount: 2, lastOrderOlderThanDays: 14 } },
  regulars: { label: 'Regulars (2+ orders)', audience: { minOrderCount: 2 } },
  top_regulars: { label: 'Loyal guests (3+ orders)', audience: { minOrderCount: 3 } },
  recent: { label: 'Guests who ordered in the last 30 days', audience: { lastOrderWithinDays: 30 } },
} as const

const DAY_MS = 86_400_000

const input = z.object({
  name: z.string().trim().min(3).max(60),
  audience: z.enum(Object.keys(SMS_AUDIENCES) as [keyof typeof SMS_AUDIENCES, ...Array<keyof typeof SMS_AUDIENCES>]),
  message: z.string().trim().min(10).max(320).describe('Use {{firstName}} and {{storeName}}; plain letters, no ₱ or emoji'),
  sendDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('YYYY-MM-DD; null = tomorrow'),
})
type Input = z.infer<typeof input>

function tomorrowManila(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1000 + DAY_MS).toISOString().slice(0, 10)
}

export const proposeSmsCampaignTool: AssistantToolDef<Input> = {
  name: 'propose_sms_campaign',
  description: 'Propose an SMS campaign (saved as a draft; only opted-in guests). The user must confirm.',
  access: { permission: 'customers' },
  input,
  async run(ctx, request) {
    const sendDate = request.sendDate ?? tomorrowManila(Date.now())
    if (sendDate < tomorrowManila(Date.now() - DAY_MS)) return refused('The send date is in the past.')
    const preset = SMS_AUDIENCES[request.audience]
    const parsed = smsCampaignDraftSchema.safeParse({
      name: request.name,
      message_template: request.message,
      audience: preset.audience,
      schedule_kind: 'one_off',
      schedule_date: sendDate,
      schedule_time: '10:00',
      // Never live from a chat: the owner activates it on the handset.
      status: 'draft',
    })
    if (!parsed.success) return refused(parsed.error.issues[0]?.message ?? 'That campaign is not valid.')

    const cost = estimateSmsSegments(request.message, 'your store')
    const proposal = await fileProposal(ctx, {
      kind: 'sms_campaign',
      payload: { draft: parsed.data },
      summary: `SMS draft "${request.name}" to ${preset.label.toLowerCase()} on ${sendDate}`,
      title: `SMS draft: ${request.name}`,
      lines: [
        { label: 'To', value: `${preset.label} who opted in` },
        { label: 'Message', value: request.message },
        { label: 'Send', value: `${sendDate}, 10:00 AM` },
        { label: 'Cost', value: `≈${cost.segments} text${cost.segments === 1 ? '' : 's'} per guest${cost.isUnicode ? ' (a symbol like ₱ makes texts shorter)' : ''}` },
      ],
      warning: 'Saved as a draft. Nothing is sent until you activate it in the merchant app on your Android phone.',
    })
    return cost.isUnicode || cost.segments > 1
      ? { ...proposal, facts: { ...proposal.facts, costNote: `About ${cost.segments} texts per guest${cost.isUnicode ? '; remove ₱/emoji to halve it' : ''}.` } }
      : proposal
  },
}
