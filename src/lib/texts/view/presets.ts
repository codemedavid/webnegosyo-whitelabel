/**
 * Ready-made campaigns for the "Start from" chooser — the merchant app's
 * CAMPAIGN_PRESETS, with the web's start times and the automatic text that
 * already does the same job every day. Pure.
 */

import type { AudienceFilter, RecipeId, ScheduleKind } from '../types'

export interface CampaignPreset {
  id: string
  title: string
  tagline: string
  name: string
  messageTemplate: string
  audience: AudienceFilter
  scheduleKind: ScheduleKind
  time: string
  intervalDays: number | null
  weekdays: number[]
  /** The automatic text that does this on its own, every day. */
  automaticTwin: { recipe: RecipeId; title: string } | null
}

export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  {
    id: 'weekend_promo', title: 'Weekend reminder', tagline: 'Every Friday morning', name: 'Weekend reminder',
    messageTemplate: 'Hi {{firstName}}, {{storeName}} is open all weekend. Save your table or order ahead!',
    audience: { minOrderCount: 2 }, scheduleKind: 'weekly', time: '10:00', intervalDays: null, weekdays: [5], automaticTwin: null,
  },
  {
    id: 'thank_regulars', title: 'Thank your regulars', tagline: 'A thank-you, once', name: 'Thank your regulars',
    messageTemplate: 'Hi {{firstName}}, thank you for your {{orderCount}} orders at {{storeName}}. See you soon!',
    audience: { minOrderCount: 3 }, scheduleKind: 'one_off', time: '10:00', intervalDays: null, weekdays: [], automaticTwin: null,
  },
  {
    id: 'win_back', title: 'Win back lapsed guests', tagline: 'Quiet for 3+ weeks', name: 'Win back lapsed guests',
    messageTemplate: 'Hi {{firstName}}, we miss you at {{storeName}}! Drop by this week for your favourite.',
    audience: { lastOrderOlderThanDays: 21 }, scheduleKind: 'every_n_days', time: '10:00', intervalDays: 14, weekdays: [],
    automaticTwin: { recipe: 'win_back', title: 'We miss you' },
  },
  {
    id: 'slipping_regulars', title: 'Nudge slipping regulars', tagline: 'Regulars gone quiet', name: 'Nudge slipping regulars',
    messageTemplate: "Hi {{firstName}}, it's been a while! Your usual is waiting at {{storeName}}. See you soon?",
    audience: { minOrderCount: 2, lastOrderOlderThanDays: 14 }, scheduleKind: 'one_off', time: '10:00', intervalDays: null, weekdays: [],
    automaticTwin: { recipe: 'regulars_gone_quiet', title: 'Regulars gone quiet' },
  },
  {
    id: 'second_visit', title: 'Invite first-timers back', tagline: 'Bring back first-timers', name: 'Invite first-timers back',
    messageTemplate: "Hi {{firstName}}, thanks for trying {{storeName}}! Come back this week, we'd love to see you again.",
    audience: { maxOrderCount: 1, lastOrderOlderThanDays: 7 }, scheduleKind: 'one_off', time: '10:00', intervalDays: null, weekdays: [],
    automaticTwin: { recipe: 'first_visit_followup', title: 'Thank first-timers' },
  },
]

export function findPreset(id: string | null | undefined): CampaignPreset | null {
  return CAMPAIGN_PRESETS.find((preset) => preset.id === id) ?? null
}
