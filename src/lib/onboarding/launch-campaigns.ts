/**
 * The ready-made text CAMPAIGN for a brand-new store, saved as a DRAFT: the
 * Friday weekend reminder, the one calendar-style blast. The follow-ups
 * (first-timers, slipping regulars, lapsed guests) are SMS automations now —
 * `launch-automations.ts` — because they text each guest once at the right
 * moment instead of re-texting a list every week.
 *
 * Its schedule REPEATS, so the draft is still valid on the day the owner
 * finally turns it on. A draft never becomes due and texts no one.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { campaignDraftToRow, smsCampaignDraftSchema, type SmsCampaignDraft } from '@/lib/sms-campaign-draft'
import { LAUNCH_AUTOMATIONS } from './launch-automations'

const FRIDAY = 5
const SEND_TIME = '10:00'
const WEEKEND = 'Weekend reminder'

/** Every ready-made text the reveal lists, in build order: the automations, then the campaign. */
export const LAUNCH_CAMPAIGNS = [
  ...LAUNCH_AUTOMATIONS.map(({ name, when }) => ({ name, when })),
  { name: WEEKEND, when: 'Fridays, to your regulars' },
] as const

export function buildLaunchCampaigns(): SmsCampaignDraft[] {
  const drafts = [
    {
      name: WEEKEND,
      message_template: 'Hi {{firstName}}, {{storeName}} is open all weekend. Order ahead and skip the wait!',
      audience: { minOrderCount: 2 },
      schedule_kind: 'weekly',
      schedule_weekdays: [FRIDAY],
    },
  ]
  // Parsed, not cast: the same schema the provisioning surface uses fills the
  // defaults (quiet hours, per-run cap) and refuses an unfireable schedule.
  return drafts.map((draft) => smsCampaignDraftSchema.parse({ ...draft, schedule_time: SEND_TIME, status: 'draft' }))
}

/** A store has a handful of campaigns at most; this bounds the read. */
const MAX_CAMPAIGN_ROWS = 100

/**
 * Save the drafts a store does not have yet (matched by name), so a retried
 * build never saves one twice. Returns how many of them the store now has.
 */
export async function draftLaunchCampaigns(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ drafted: number }> {
  const drafts = buildLaunchCampaigns()
  const { data, error } = await admin.from('sms_campaigns').select('name').eq('tenant_id', tenantId).limit(MAX_CAMPAIGN_ROWS)
  if (error) throw new Error(`Text campaigns could not be read: ${error.message}`)
  const existing = new Set(((data ?? []) as Array<{ name: string }>).map((row) => row.name))

  const missing = drafts.filter((draft) => !existing.has(draft.name))
  if (missing.length > 0) {
    const { error: insertError } = await admin.from('sms_campaigns').insert(missing.map((draft) => campaignDraftToRow(tenantId, draft)))
    if (insertError) throw new Error(`Text campaigns could not be saved: ${insertError.message}`)
  }
  return { drafted: drafts.length }
}
