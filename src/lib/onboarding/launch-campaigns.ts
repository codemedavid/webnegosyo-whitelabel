/**
 * Ready-made text campaigns for a brand-new store, saved as DRAFTS.
 *
 * They are the merchant app's presets (`webnegosyo-app/lib/sms/campaign-presets.ts`)
 * reworked for a store with no guests yet: every schedule REPEATS, so a draft
 * is still valid on the day the owner finally turns it on (a one-off dated at
 * build time would be in the past by then, and the app refuses to activate
 * it). The first-timer text names the stamp-card reward when it texts cleanly.
 *
 * A draft never becomes due and texts no one. Sending happens only from the
 * owner's Android phone after they tap Activate in the app.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { campaignDraftToRow, smsCampaignDraftSchema, type SmsCampaignDraft } from '@/lib/sms-campaign-draft'

export interface LaunchCampaignOptions {
  /** "Free Spanish Latte"; null when the store has no stamp card. */
  rewardLabel: string | null
  threshold: number | null
}

/** Plain letters only: anything else makes the text a costlier UCS-2 message. */
const PLAIN_TEXT = /^[A-Za-z0-9 .,'&!()-]+$/
/** Keeps the first-timer text one SMS even with a long store name. */
const MAX_REWARD_TEXT = 30
const FRIDAY = 5
const SEND_TIME = '10:00'

function rewardSentence({ rewardLabel, threshold }: LaunchCampaignOptions): string | null {
  const reward = rewardLabel?.trim()
  if (!reward || !threshold || reward.length > MAX_REWARD_TEXT || !PLAIN_TEXT.test(reward)) return null
  return `Order again and collect stamps: ${threshold} orders = ${reward}.`
}

export function buildLaunchCampaigns(options: LaunchCampaignOptions): SmsCampaignDraft[] {
  const reward = rewardSentence(options)
  const drafts = [
    {
      name: 'Invite first-timers back',
      message_template: reward
        ? `Hi {{firstName}}, thanks for trying {{storeName}}! ${reward}`
        : "Hi {{firstName}}, thanks for trying {{storeName}}! Come back this week, we'd love to see you again.",
      audience: { maxOrderCount: 1, lastOrderOlderThanDays: 7 },
      schedule_kind: 'every_n_days',
      schedule_interval_days: 7,
    },
    {
      name: 'Nudge slipping regulars',
      message_template: "Hi {{firstName}}, it's been a while! Your usual is waiting at {{storeName}}. See you soon?",
      audience: { minOrderCount: 2, lastOrderOlderThanDays: 14 },
      schedule_kind: 'every_n_days',
      schedule_interval_days: 14,
    },
    {
      name: 'Win back lapsed guests',
      message_template: 'Hi {{firstName}}, we miss you at {{storeName}}! Drop by this week for your favourite.',
      audience: { lastOrderOlderThanDays: 21 },
      schedule_kind: 'every_n_days',
      schedule_interval_days: 14,
    },
    {
      name: 'Weekend reminder',
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
  options: LaunchCampaignOptions,
): Promise<{ drafted: number }> {
  const drafts = buildLaunchCampaigns(options)
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
