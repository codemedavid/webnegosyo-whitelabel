/**
 * The campaign editor's rules.
 *
 * Everything here runs before a campaign can be saved, and the reason is
 * timing: every rule below describes a failure that is cheap to catch now and
 * expensive to catch later.
 *
 * - An unknown `{{placeholder}}` makes `renderMessage` throw. At save time that
 *   is a red field; at send time it is a run that fails per recipient after the
 *   merchant has already tapped Send.
 * - A one-off dated in the past can never become due, so the campaign would sit
 *   in the list looking scheduled and silently never fire.
 * - The cap and the schedule-field rules mirror the database CHECK constraints
 *   (`sms_campaigns_max_per_run_ck`, `sms_campaigns_schedule_fields_ck`). They
 *   are duplicated rather than deferred to on purpose: one of those constraints
 *   was already found to have a NULL hole, and a form that only fails when
 *   Postgres complains inherits every gap the constraint has.
 */

import { countSmsSegments, validateTemplate } from "./message-template";
import type { SmsEncoding } from "./message-template";
import type { AudienceFilter, ScheduleKind } from "./types";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_WEEKDAY = 1;
const MAX_WEEKDAY = 7;
const MAX_PER_RUN_LIMIT = 200;

/** Default cap, chosen to stay under Android's ~30-per-30-minutes throttle. */
const DEFAULT_MAX_PER_RUN = 25;

export interface CampaignDraft {
  name: string;
  messageTemplate: string;
  audience: AudienceFilter;
  scheduleKind: ScheduleKind;
  scheduleTime: string;
  scheduleDate: string | null;
  scheduleIntervalDays: number | null;
  scheduleWeekdays: number[];
  quietHoursStart: string;
  quietHoursEnd: string;
  maxPerRun: number;
}

export const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = {
  name: "",
  messageTemplate: "",
  audience: {},
  scheduleKind: "one_off",
  scheduleTime: "10:00",
  scheduleDate: null,
  scheduleIntervalDays: null,
  scheduleWeekdays: [],
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  maxPerRun: DEFAULT_MAX_PER_RUN,
};

export type CampaignFieldError = Partial<Record<keyof CampaignDraft, string>>;

export interface CampaignValidation {
  isValid: boolean;
  errors: CampaignFieldError;
}

/**
 * Validate a draft against `today` (a Manila "YYYY-MM-DD").
 *
 * `today` is passed in rather than read from the clock so the same draft always
 * validates the same way in a test, and so the comparison happens on the
 * merchant's calendar rather than the device's UTC date.
 */
export function validateCampaignDraft(
  draft: CampaignDraft,
  today: string
): CampaignValidation {
  const errors: CampaignFieldError = {};

  if (draft.name.trim() === "") {
    errors.name = "Give this campaign a name.";
  }

  if (draft.messageTemplate.trim() === "") {
    errors.messageTemplate = "Write the message you want to send.";
  } else {
    const template = validateTemplate(draft.messageTemplate);
    if (!template.isValid) {
      errors.messageTemplate = `Unknown variable: ${template.unknownVariables.join(", ")}`;
    }
  }

  if (!TIME_PATTERN.test(draft.scheduleTime)) {
    errors.scheduleTime = "Use a 24-hour time like 09:30.";
  }

  Object.assign(errors, validateSchedule(draft, today));

  if (
    !Number.isInteger(draft.maxPerRun) ||
    draft.maxPerRun < 1 ||
    draft.maxPerRun > MAX_PER_RUN_LIMIT
  ) {
    errors.maxPerRun = `Send between 1 and ${MAX_PER_RUN_LIMIT} messages per run.`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateSchedule(draft: CampaignDraft, today: string): CampaignFieldError {
  if (draft.scheduleKind === "one_off") {
    if (!draft.scheduleDate) {
      return { scheduleDate: "Pick the date to send." };
    }
    // String comparison is safe and exact for ISO dates, and avoids dragging a
    // timezone into a question that is purely about the merchant's calendar.
    if (draft.scheduleDate < today) {
      return { scheduleDate: "That date is in the past, so this would never send." };
    }
    return {};
  }

  if (draft.scheduleKind === "every_n_days") {
    const interval = draft.scheduleIntervalDays;
    if (interval === null || !Number.isInteger(interval) || interval < 1) {
      return { scheduleIntervalDays: "Repeat every 1 day or more." };
    }
    return {};
  }

  const weekdays = draft.scheduleWeekdays;
  if (weekdays.length === 0) {
    return { scheduleWeekdays: "Pick at least one day of the week." };
  }
  if (weekdays.some((day) => !Number.isInteger(day) || day < MIN_WEEKDAY || day > MAX_WEEKDAY)) {
    return { scheduleWeekdays: "Days of the week must be Monday through Sunday." };
  }
  return {};
}

export interface CampaignCost {
  segmentsPerMessage: number;
  totalSegments: number;
  encoding: SmsEncoding;
  recipientCount: number;
}

/**
 * What this campaign will cost to send, in SMS segments.
 *
 * Placeholders are replaced with a representative value rather than measured
 * as raw template text: `{{firstName}}` is 13 characters on screen but renders
 * to a name, so a merchant judging length by what they typed would misjudge
 * every campaign — usually in the expensive direction.
 */
export function describeCampaignCost(
  template: string,
  recipientCount: number
): CampaignCost {
  const sample = template.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, SAMPLE_VALUE);
  const { segments, encoding } = countSmsSegments(sample);
  // An empty template still costs one segment once anything is typed into it;
  // reporting 0 would read as "free".
  const segmentsPerMessage = Math.max(1, segments);

  return {
    segmentsPerMessage,
    totalSegments: segmentsPerMessage * Math.max(0, recipientCount),
    encoding,
    recipientCount: Math.max(0, recipientCount),
  };
}

/** A typical rendered value; roughly the length of a Filipino given name. */
const SAMPLE_VALUE = "Maria";
