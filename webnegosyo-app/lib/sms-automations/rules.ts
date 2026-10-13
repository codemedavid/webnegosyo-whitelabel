/**
 * The Texting rules tab: the few sensible choices for each rule, why each
 * rule exists in one line, and the review-link check. Pure.
 *
 * The opt-out line is deliberately absent: STOP replies are not handled yet,
 * so offering "Reply STOP" would promise guests something nobody honours.
 */

import type { TextingRules } from "./api";
import { quietWindowText } from "./view";

export interface Choice<T> {
  label: string;
  value: T;
}

const QUIET_WINDOWS: readonly { start: string; end: string }[] = [
  { start: "21:00", end: "08:00" },
  { start: "22:00", end: "07:00" },
  { start: "20:00", end: "09:00" },
];
const GUEST_CAP_DAYS = [1, 2, 3, 5, 7] as const;
const DAILY_LIMITS = [25, 50, 100, 200] as const;

export const RULE_WHY = {
  reviewUrl: "Your Google or Facebook review page. The review request text links to it.",
  quietHours: "Texts that come due at night wait until morning. None are lost.",
  guestCap: "However many automations want the same guest, they hear from you at most once in this time.",
  dailyLimit: "The most your phone sends in a day. Carriers can block a SIM that sends too many.",
} as const;

/** "21:00-08:00" — one value per window, for the pills. */
export function quietKey(rules: Pick<TextingRules, "quietHoursStart" | "quietHoursEnd">): string {
  return `${rules.quietHoursStart}-${rules.quietHoursEnd}`;
}

/** The standard windows, plus the store's own if it is not one of them. */
export function quietHourChoices(current: TextingRules): Choice<string>[] {
  const windows = QUIET_WINDOWS.some((w) => quietKey({ quietHoursStart: w.start, quietHoursEnd: w.end }) === quietKey(current))
    ? QUIET_WINDOWS
    : [...QUIET_WINDOWS, { start: current.quietHoursStart, end: current.quietHoursEnd }];
  return windows.map((w) => ({
    label: quietWindowText({ quietHoursStart: w.start, quietHoursEnd: w.end }),
    value: quietKey({ quietHoursStart: w.start, quietHoursEnd: w.end }),
  }));
}

/** Applies a quiet-hours pill to the rules. */
export function withQuietHours(rules: TextingRules, key: string): TextingRules {
  const [quietHoursStart, quietHoursEnd] = key.split("-");
  return quietHoursStart && quietHoursEnd ? { ...rules, quietHoursStart, quietHoursEnd } : rules;
}

function withCurrent(values: readonly number[], current: number): number[] {
  return values.includes(current) ? [...values] : [...values, current].sort((a, b) => a - b);
}

export function guestCapChoices(current: number): Choice<number>[] {
  return withCurrent(GUEST_CAP_DAYS, current).map((days) => ({ label: days === 1 ? "1 day" : `${days} days`, value: days }));
}

export function dailyLimitChoices(current: number): Choice<number>[] {
  return withCurrent(DAILY_LIMITS, current).map((limit) => ({ label: `${limit} a day`, value: limit }));
}

const REVIEW_URL = /^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;
const MAX_REVIEW_URL = 300;

/** Why this review link would be refused, or null (blank = no link, which is fine). */
export function reviewUrlProblem(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (value.length > MAX_REVIEW_URL || !REVIEW_URL.test(value)) return "Paste the full review link, starting with https://";
  return null;
}

export function sameRules(a: TextingRules, b: TextingRules): boolean {
  return (
    a.quietHoursStart === b.quietHoursStart &&
    a.quietHoursEnd === b.quietHoursEnd &&
    a.guestCapDays === b.guestCapDays &&
    a.dailyLimit === b.dailyLimit &&
    (a.reviewUrl ?? "").trim() === (b.reviewUrl ?? "").trim()
  );
}
