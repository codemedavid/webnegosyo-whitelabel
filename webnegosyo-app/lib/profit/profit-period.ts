/**
 * The Profit screen's windows, in Manila business days (UTC+8, no DST).
 *
 * Every window is half-open `[start, end)` in epoch ms, as the report
 * functions take them, and never longer than their 93-day cap. A window that
 * holds "now" ends at now ("so far"), like the web's report periods. Pure:
 * the caller supplies the clock.
 */

import type { ProfitGrain } from "./profit-types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MANILA_OFFSET_MS = 8 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** The report functions refuse longer windows (reporting.assert_access). */
export const MAX_PROFIT_DAYS = 93;
/** How many bars the trend draws. */
export const TREND_BARS = 6;

export type ProfitPreset = "this_month" | "last_month" | "this_week" | "custom";

export type ProfitSelection =
  | { preset: "this_month" | "last_month" | "this_week" }
  | { preset: "custom"; fromKey: string; toKey: string };

export interface ProfitWindow {
  preset: ProfitPreset;
  start: number;
  /** The read's end: now while the period is still running. */
  end: number;
  /** Where the period ends when it is over. */
  fullEnd: number;
  isPartial: boolean;
  /** "October", "Oct 13 – 19". */
  label: string;
  /** "this month", "last month", "this week", "in these days". */
  phrase: string;
  /** First and last Manila day, inclusive. */
  fromKey: string;
  toKey: string;
}

export const PRESET_LABELS: Readonly<Record<ProfitPreset, string>> = {
  this_month: "This month",
  last_month: "Last month",
  this_week: "This week",
  custom: "Custom",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function manilaDay(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function manilaMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`) - MANILA_OFFSET_MS;
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function nextMonthStart(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function previousMonthStart(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function shortDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

function window(preset: ProfitPreset, fromKey: string, fullEndKey: string, nowMs: number, label: string, phrase: string): ProfitWindow {
  const start = manilaMidnight(fromKey);
  const fullEnd = manilaMidnight(fullEndKey);
  const isPartial = nowMs < fullEnd;
  return {
    preset,
    start,
    end: isPartial ? Math.max(start, nowMs) : fullEnd,
    fullEnd,
    isPartial,
    label,
    phrase,
    fromKey,
    toKey: addDays(fullEndKey, -1),
  };
}

/** Days in an inclusive custom range; 0 when it runs backwards. */
export function customDays(fromKey: string, toKey: string): number {
  const days = Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS) + 1;
  return Math.max(0, days);
}

export type SelectionVerdict = { ok: true } | { ok: false; reason: string };

export function checkCustomRange(fromKey: string, toKey: string, nowMs: number): SelectionVerdict {
  const days = customDays(fromKey, toKey);
  if (days === 0) return { ok: false, reason: "The first day must come before the last." };
  if (days > MAX_PROFIT_DAYS) return { ok: false, reason: `Pick ${MAX_PROFIT_DAYS} days or fewer.` };
  if (fromKey > manilaDay(nowMs)) return { ok: false, reason: "That range hasn't started yet." };
  return { ok: true };
}

export function resolveProfitWindow(selection: ProfitSelection, nowMs: number): ProfitWindow {
  const today = manilaDay(nowMs);
  switch (selection.preset) {
    case "this_month":
      return window("this_month", monthStart(today), nextMonthStart(today), nowMs, LONG_MONTHS[Number(today.slice(5, 7)) - 1], "this month");
    case "last_month": {
      const from = previousMonthStart(today);
      return window("last_month", from, monthStart(today), nowMs, LONG_MONTHS[Number(from.slice(5, 7)) - 1], "last month");
    }
    case "this_week": {
      const monday = mondayOf(today);
      return window("this_week", monday, addDays(monday, 7), nowMs, `${shortDay(monday)} – ${shortDay(addDays(monday, 6))}`, "this week");
    }
    case "custom": {
      const days = Math.min(Math.max(customDays(selection.fromKey, selection.toKey), 1), MAX_PROFIT_DAYS);
      const label =
        days === 1 ? shortDay(selection.fromKey) : `${shortDay(selection.fromKey)} – ${shortDay(addDays(selection.fromKey, days - 1))}`;
      return window("custom", selection.fromKey, addDays(selection.fromKey, days), nowMs, label, days === 1 ? "on that day" : "in these days");
    }
  }
}

/**
 * The whole period before this one, for "you paid rent last month but not
 * yet this month" (the web's `previousFullWindow`): the previous calendar
 * month for month periods, otherwise the same length just before. Null for
 * periods under a week.
 */
export function previousFullWindow(w: ProfitWindow): { start: number; end: number } | null {
  if (w.preset === "this_month" || w.preset === "last_month") {
    return { start: manilaMidnight(previousMonthStart(w.fromKey)), end: w.start };
  }
  const length = w.preset === "this_week" ? WEEK_MS : w.fullEnd - w.start;
  if (length < WEEK_MS) return null;
  return { start: w.start - length, end: w.start };
}

/** Days for a short window, weeks otherwise: a phone fits about six bars. */
export function trendGrainFor(w: ProfitWindow): ProfitGrain {
  return w.fullEnd - w.start <= 14 * DAY_MS ? "day" : "week";
}

function bucketOf(day: string, grain: ProfitGrain): string {
  if (grain === "day") return day;
  if (grain === "month") return monthStart(day);
  return mondayOf(day);
}

/** Every bucket from the window's first day to its read end, oldest first. */
export function bucketKeys(w: ProfitWindow, grain: ProfitGrain): string[] {
  const keys: string[] = [];
  const lastDay = manilaDay(Math.max(w.start, w.end - 1));
  for (let day = w.fromKey; day <= lastDay; day = addDays(day, 1)) {
    const key = bucketOf(day, grain);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

export function bucketLabel(bucket: string, grain: ProfitGrain): string {
  if (grain === "day") return `${WEEKDAYS[new Date(`${bucket}T00:00:00.000Z`).getUTCDay()]} ${Number(bucket.slice(8, 10))}`;
  if (grain === "month") return MONTHS[Number(bucket.slice(5, 7)) - 1];
  return shortDay(bucket);
}

/** "This month so far · Main branch". */
export function profitCaption(w: ProfitWindow, branchLabel: string | null): string {
  const when = `${w.preset === "custom" ? w.label : PRESET_LABELS[w.preset]}${w.isPartial ? " so far" : ""}`;
  return branchLabel ? `${when} · ${branchLabel}` : when;
}
