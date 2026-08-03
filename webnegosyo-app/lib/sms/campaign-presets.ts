/**
 * Ready-made campaigns.
 *
 * `EMPTY_CAMPAIGN_DRAFT` is a one-off with no date, which fails validation the
 * moment the editor opens: the merchant is met with a form that is already
 * wrong and six fields to reason about before anything can be saved. Most of
 * those fields have one sensible answer for a restaurant, and picking them is
 * the app's job.
 *
 * Every preset here builds a draft that is valid on arrival — pinned by a test
 * that validates all of them — and every message is kept short and on plain
 * letters, because a preset that silently costs two segments per guest is the
 * exact surprise the cost box exists to prevent.
 */

import { EMPTY_CAMPAIGN_DRAFT, type CampaignDraft } from "./campaign-form";
import type { AudienceFilter, ScheduleKind } from "./types";

export interface CampaignPreset {
  id: string;
  /** What the merchant taps. */
  title: string;
  /** Who it texts, in a sentence — not what it configures. */
  description: string;
}

interface PresetDefinition extends CampaignPreset {
  name: string;
  messageTemplate: string;
  audience: AudienceFilter;
  scheduleKind: ScheduleKind;
  scheduleTime: string;
  scheduleIntervalDays: number | null;
  scheduleWeekdays: number[];
}

/** Two weeks quiet is the point most PH quick-service guests stop being regulars. */
const LAPSED_DAYS = 21;

const DEFINITIONS: readonly PresetDefinition[] = [
  {
    id: "win_back",
    title: "Win back lapsed guests",
    description: `Texts guests who have not ordered in ${LAPSED_DAYS} days, once every two weeks.`,
    name: "Win back lapsed guests",
    messageTemplate:
      "Hi {{firstName}}, we miss you at {{storeName}}! Drop by this week for your favourite.",
    audience: { lastOrderOlderThanDays: LAPSED_DAYS },
    scheduleKind: "every_n_days",
    scheduleTime: "10:00",
    scheduleIntervalDays: 14,
    scheduleWeekdays: [],
  },
  {
    id: "weekend_promo",
    title: "Weekend reminder",
    description: "Texts your regulars every Friday morning, before they make other plans.",
    name: "Weekend reminder",
    messageTemplate:
      "Hi {{firstName}}, {{storeName}} is open all weekend. Save your table or order ahead!",
    audience: { minOrderCount: 2 },
    scheduleKind: "weekly",
    scheduleTime: "10:00",
    scheduleIntervalDays: null,
    scheduleWeekdays: [5],
  },
  {
    id: "thank_regulars",
    title: "Thank your regulars",
    description: "A one-off thank-you to guests who have ordered three times or more.",
    name: "Thank your regulars",
    messageTemplate:
      "Hi {{firstName}}, thank you for your {{orderCount}} orders at {{storeName}}. See you soon!",
    audience: { minOrderCount: 3 },
    scheduleKind: "one_off",
    scheduleTime: "10:00",
    scheduleIntervalDays: null,
    scheduleWeekdays: [],
  },
];

export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = DEFINITIONS.map(
  ({ id, title, description }) => ({ id, title, description })
);

/**
 * Build a fresh, valid draft from a preset.
 *
 * `today` is passed in rather than read from the clock for the same reason
 * `validateCampaignDraft` takes it: a one-off must be dated on the merchant's
 * Manila calendar, and a device an hour ahead of UTC midnight must not produce
 * a campaign that validates as already in the past.
 *
 * Throws on an unknown id. A blank draft returned quietly would look exactly
 * like the tap did nothing.
 */
export function buildPresetDraft(presetId: string, today: string): CampaignDraft {
  const definition = DEFINITIONS.find((preset) => preset.id === presetId);
  if (!definition) {
    throw new Error(`Unknown campaign preset: ${presetId}`);
  }

  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    name: definition.name,
    messageTemplate: definition.messageTemplate,
    // Copied, not shared: the editor patches these in place as the merchant
    // types, and a shared reference would edit the preset for the next tap.
    audience: { ...definition.audience },
    scheduleKind: definition.scheduleKind,
    scheduleTime: definition.scheduleTime,
    scheduleDate: definition.scheduleKind === "one_off" ? today : null,
    scheduleIntervalDays: definition.scheduleIntervalDays,
    scheduleWeekdays: [...definition.scheduleWeekdays],
  };
}
