/**
 * The window a staff screen's period chips mean.
 *
 * "Today" is today's Manila business day, not the last 24 hours: a rolling
 * window shows yesterday's dinner rush under "Today" in the morning and hides
 * this morning's sales by evening. "7 days" is today plus the six days before.
 */

import { resolveBusinessDayWindow, toBusinessDayKey } from "../daily-report/business-day";
import type { ActivityWindow } from "./activity";

const DAY_MS = 24 * 60 * 60 * 1000;

export function staffPeriodWindow(days: number, nowMs: number): ActivityWindow {
  const todayKey = toBusinessDayKey(new Date(nowMs).toISOString());
  const todayStartMs = Date.parse(resolveBusinessDayWindow(todayKey).startIso);
  const spanDays = Math.max(1, Math.floor(days));
  return { startMs: todayStartMs - (spanDays - 1) * DAY_MS, endMs: nowMs };
}
