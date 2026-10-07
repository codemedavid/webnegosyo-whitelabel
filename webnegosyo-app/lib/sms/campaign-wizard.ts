/**
 * The guided campaign flow.
 *
 * The editor used to be one scroll of fifteen fields — name, message, three
 * number boxes, schedule chips, two pickers, two quiet-hour pickers, a test
 * panel — and a merchant mid-service had to work out which of them mattered
 * before anything could be saved. The flow now asks one question per screen:
 *
 *   goal → message → who → when → review
 *
 * Everything that decides what those screens say lives here, pure, so that
 * "may I go on?", "which audience card is lit?" and "what does this schedule
 * mean in words?" are tested rather than eyeballed. Nothing here changes what
 * a campaign IS: the draft, its validation and every send rule are untouched.
 */

import type { CampaignDraft, CampaignValidation } from "./campaign-form";
import type { AudienceFilter, ScheduleKind } from "./types";

export type WizardStep = "goal" | "message" | "audience" | "schedule" | "review";

export const NEW_CAMPAIGN_STEPS: readonly WizardStep[] = [
  "goal",
  "message",
  "audience",
  "schedule",
  "review",
];

/** Short labels for the progress rail. */
export const STEP_LABELS: Record<WizardStep, string> = {
  goal: "Goal",
  message: "Message",
  audience: "Who",
  schedule: "When",
  review: "Review",
};

/**
 * Which draft fields each step owns. A step is complete when none of ITS
 * fields has an error, so a missing date (a WHEN problem) never holds the
 * merchant on the message screen.
 */
const STEP_FIELDS: Record<WizardStep, readonly (keyof CampaignDraft)[]> = {
  goal: [],
  message: ["name", "messageTemplate"],
  audience: ["audience"],
  schedule: [
    "scheduleKind",
    "scheduleTime",
    "scheduleDate",
    "scheduleIntervalDays",
    "scheduleWeekdays",
    "quietHoursStart",
    "quietHoursEnd",
  ],
  review: [],
};

export function nextStep(step: WizardStep): WizardStep {
  const index = NEW_CAMPAIGN_STEPS.indexOf(step);
  return NEW_CAMPAIGN_STEPS[Math.min(index + 1, NEW_CAMPAIGN_STEPS.length - 1)];
}

export function previousStep(step: WizardStep): WizardStep | null {
  const index = NEW_CAMPAIGN_STEPS.indexOf(step);
  return index > 0 ? NEW_CAMPAIGN_STEPS[index - 1] : null;
}

export function isStepComplete(step: WizardStep, validation: CampaignValidation): boolean {
  // Review is the whole campaign: it may only be passed by a valid draft.
  if (step === "review") return validation.isValid;
  return STEP_FIELDS[step].every((field) => !validation.errors[field]);
}

/** The earliest step with something to fix, or null when the draft is valid. */
export function firstIncompleteStep(validation: CampaignValidation): WizardStep | null {
  if (validation.isValid) return null;
  return (
    NEW_CAMPAIGN_STEPS.find(
      (step) => step !== "review" && !isStepComplete(step, validation)
    ) ?? "review"
  );
}

// ─── Who ─────────────────────────────────────────────────────────────────────

export type AudienceSegmentId = "everyone" | "lapsed" | "regulars" | "first_timers" | "recent";

export interface AudienceSegment {
  id: AudienceSegmentId;
  title: string;
  description: string;
  filter: AudienceFilter;
}

/** Three weeks quiet: the same line the win-back preset draws. */
const LAPSED_DAYS = 21;
const REGULAR_MIN_ORDERS = 3;
const RECENT_DAYS = 30;

export const AUDIENCE_SEGMENTS: readonly AudienceSegment[] = [
  {
    id: "everyone",
    title: "Everyone",
    description: "Every guest who agreed to texts",
    filter: {},
  },
  {
    id: "lapsed",
    title: "Haven't been back",
    description: `No order in ${LAPSED_DAYS}+ days`,
    filter: { lastOrderOlderThanDays: LAPSED_DAYS },
  },
  {
    id: "regulars",
    title: "Regulars",
    description: `${REGULAR_MIN_ORDERS}+ orders so far`,
    filter: { minOrderCount: REGULAR_MIN_ORDERS },
  },
  {
    id: "first_timers",
    title: "First-timers",
    description: "Ordered exactly once",
    filter: { maxOrderCount: 1 },
  },
  {
    id: "recent",
    title: "Recent guests",
    description: `Ordered in the last ${RECENT_DAYS} days`,
    filter: { lastOrderWithinDays: RECENT_DAYS },
  },
];

/** The filter keys this editor shows and owns. Anything else is kept as-is. */
const MANAGED_KEYS = [
  "lastOrderOlderThanDays",
  "lastOrderWithinDays",
  "minOrderCount",
  "maxOrderCount",
] as const satisfies readonly (keyof AudienceFilter)[];

function hasUnmanagedFilter(filter: AudienceFilter): boolean {
  return (
    filter.minTotalSpent !== undefined ||
    (filter.channels !== undefined && filter.channels.length > 0)
  );
}

function sameManagedFilter(a: AudienceFilter, b: AudienceFilter): boolean {
  return MANAGED_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Which card a filter is. A filter carrying anything the editor cannot show
 * (a spend floor, a channel list) is "custom" — calling it "Everyone" would
 * tell the merchant a bigger story than the count beside it.
 */
export function matchAudienceSegment(filter: AudienceFilter): AudienceSegmentId | "custom" {
  if (hasUnmanagedFilter(filter)) return "custom";
  const match = AUDIENCE_SEGMENTS.find((segment) => sameManagedFilter(filter, segment.filter));
  return match ? match.id : "custom";
}

/** Swap the managed half of a filter for a segment's, keeping the rest. */
export function applyAudienceSegment(
  current: AudienceFilter,
  segmentId: AudienceSegmentId
): AudienceFilter {
  const segment = AUDIENCE_SEGMENTS.find((candidate) => candidate.id === segmentId);
  const kept = Object.fromEntries(
    Object.entries(current).filter(
      ([key]) => !(MANAGED_KEYS as readonly string[]).includes(key)
    )
  ) as AudienceFilter;
  return { ...kept, ...(segment?.filter ?? {}) };
}

/** The audience as one plain sentence, for the review card. */
export function describeAudience(filter: AudienceFilter): string {
  const parts: string[] = [];
  if (filter.minOrderCount !== undefined) parts.push(`${filter.minOrderCount}+ orders`);
  if (filter.maxOrderCount !== undefined) {
    parts.push(`at most ${filter.maxOrderCount} ${filter.maxOrderCount === 1 ? "order" : "orders"}`);
  }
  if (filter.lastOrderOlderThanDays !== undefined) {
    parts.push(`quiet for ${filter.lastOrderOlderThanDays}+ days`);
  }
  if (filter.lastOrderWithinDays !== undefined) {
    parts.push(`ordered in the last ${filter.lastOrderWithinDays} days`);
  }
  if (filter.minTotalSpent !== undefined) parts.push(`spent ₱${filter.minTotalSpent}+`);

  if (parts.length === 0) return "Everyone who agreed to texts";
  const [first, ...rest] = parts;
  const lead = /^\d|^at most/.test(first) ? `Guests with ${first}` : `Guests ${first}`;
  return [lead, ...rest].join(", ");
}

// ─── When ────────────────────────────────────────────────────────────────────

export interface TimePreset {
  label: string;
  time: string;
}

/** Times a restaurant actually texts at — all outside the default quiet hours. */
export const SEND_TIME_PRESETS: readonly TimePreset[] = [
  { label: "Morning", time: "09:00" },
  { label: "Before lunch", time: "10:00" },
  { label: "Afternoon", time: "15:00" },
  { label: "Before dinner", time: "17:00" },
];

export const INTERVAL_PRESETS: readonly number[] = [7, 14, 30];

const DEFAULT_INTERVAL_DAYS = 14;
/** Friday: the weekend-planning text. */
const DEFAULT_WEEKDAYS: readonly number[] = [5];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/** "18:00" → "6:00 PM". A string that is not HH:MM comes back untouched. */
export function formatTime12h(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/** "YYYY-MM-DD" one day later, computed on the calendar, not a clock. */
export function addOneDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** "Today", "Tomorrow" or "Dec 24" for a Manila calendar date. */
export function describeDate(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addOneDay(today)) return "tomorrow";
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The schedule in one sentence, e.g. "Every 14 days at 10:00 AM". */
export function describeSchedule(draft: CampaignDraft, today: string): string {
  const at = `at ${formatTime12h(draft.scheduleTime)}`;

  if (draft.scheduleKind === "one_off") {
    if (!draft.scheduleDate) return "Once — pick a date";
    return `Once, ${describeDate(draft.scheduleDate, today)} ${at}`;
  }

  if (draft.scheduleKind === "every_n_days") {
    const days = draft.scheduleIntervalDays;
    if (!days) return "Repeats — pick how often";
    return days === 1 ? `Every day ${at}` : `Every ${days} days ${at}`;
  }

  if (draft.scheduleWeekdays.length === 0) return "Weekly — pick the days";
  const days = [...draft.scheduleWeekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]);
  return `Every ${joinWords(days)} ${at}`;
}

/**
 * Switch how often a campaign sends, filling in whatever the new kind needs so
 * the merchant never lands on a schedule that is already an error.
 */
export function switchScheduleKind(
  draft: CampaignDraft,
  kind: ScheduleKind,
  today: string
): Partial<CampaignDraft> {
  if (kind === "one_off") {
    const isUsable = draft.scheduleDate !== null && draft.scheduleDate >= today;
    return { scheduleKind: kind, scheduleDate: isUsable ? draft.scheduleDate : today };
  }
  if (kind === "every_n_days") {
    return {
      scheduleKind: kind,
      scheduleIntervalDays: draft.scheduleIntervalDays ?? DEFAULT_INTERVAL_DAYS,
    };
  }
  return {
    scheduleKind: kind,
    scheduleWeekdays:
      draft.scheduleWeekdays.length > 0 ? draft.scheduleWeekdays : [...DEFAULT_WEEKDAYS],
  };
}

// ─── Message ─────────────────────────────────────────────────────────────────

export interface TextSelection {
  start: number;
  end: number;
}

/**
 * Put a placeholder where the cursor is.
 *
 * The old chips always appended, so "Hi , we miss you" plus "First name"
 * became "Hi , we miss you{{firstName}}" and the merchant had to cut and paste
 * on a phone keyboard. With no cursor yet (the field was never focused) it
 * appends, with a space so it does not glue onto the last word.
 */
export function insertToken(
  text: string,
  selection: TextSelection | null,
  token: string
): { text: string; cursor: number } {
  if (!selection) {
    const glue = text === "" || /\s$/.test(text) ? "" : " ";
    const next = `${text}${glue}${token}`;
    return { text: next, cursor: next.length };
  }
  const start = Math.min(Math.max(0, selection.start), text.length);
  const end = Math.min(Math.max(start, selection.end), text.length);
  const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
  return { text: next, cursor: start + token.length };
}
