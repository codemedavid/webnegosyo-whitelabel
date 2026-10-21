/**
 * The Expenses screen's window and words (design brief §1): which days are on
 * screen, what the URL asked for, and how the header and the hero name it.
 *
 * The screen shows one Manila month, or an exact range of days when Profit
 * links in with `from`/`to`. Everything here is pure; the caller passes the
 * clock. Dates are Manila business dates (`YYYY-MM-DD`).
 */

import { monthBounds, monthLabel, manilaToday, monthOf, shiftMonth } from "./expense-format";
import { addDays } from "./manila-date";
import type { Change } from "./money-text";

export const HOME_VIEWS = ["all", "drawer", "no_receipt", "check"] as const;
export type HomeView = (typeof HOME_VIEWS)[number];

/** Inclusive Manila days. */
export interface DayRange {
  from: string;
  to: string;
}

/** Profit's report windows stop at 93 days; a link never asks for more. */
export const MAX_RANGE_DAYS = 93;
/** 93 days touch at most four calendar months. */
export const MAX_RANGE_MONTHS = 4;

const MAX_CATEGORY_ID_LENGTH = 64;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FILTER_VIEWS: readonly HomeView[] = ["drawer", "no_receipt", "check"];
const PARAM_KEYS = ["add", "category", "month", "view", "from", "to"] as const;

type RawParam = string | string[] | undefined;
export type RawHomeParams = Readonly<Partial<Record<string, RawParam>>>;

export interface HomeParams {
  month: string | null;
  range: DayRange | null;
  view: HomeView | null;
  categoryId: string | null;
  isAdd: boolean;
  /** `view=unsorted`: open the pay-outs sheet. */
  isSort: boolean;
}

function first(value: RawParam): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

function isRealDate(value: string | null): value is string {
  if (value === null || !DATE_KEY.test(value)) return false;
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(epoch) && new Date(epoch).toISOString().slice(0, 10) === value;
}

function parseRange(fromRaw: string | null, toRaw: string | null): DayRange | null {
  const fromOk = isRealDate(fromRaw) ? fromRaw : null;
  const toOk = isRealDate(toRaw) ? toRaw : null;
  if (fromRaw !== null && fromOk === null) return null;
  if (toRaw !== null && toOk === null) return null;
  const a = fromOk ?? toOk;
  const b = toOk ?? fromOk;
  if (a === null || b === null) return null;
  const [from, to] = a <= b ? [a, b] : [b, a];
  const lastAllowed = addDays(from, MAX_RANGE_DAYS - 1);
  return { from, to: to > lastAllowed ? lastAllowed : to };
}

/** True when the URL carries anything this screen acts on. */
export function hasHomeParams(raw: RawHomeParams): boolean {
  return PARAM_KEYS.some((key) => first(raw[key]) !== null);
}

/**
 * A range that IS a month (the whole of it, or this month so far) is shown as
 * that month, so it keeps the month's change pill and "Today" line.
 */
function monthOfWholeRange(range: DayRange, nowMs: number): string | null {
  const month = monthOf(range.from);
  const bounds = monthBounds(month);
  if (range.from !== bounds.from || monthOf(range.to) !== month) return null;
  if (range.to === bounds.to) return month;
  return month === monthOf(nowMs) && range.to >= manilaToday(nowMs) ? month : null;
}

/** What the URL asked for, validated; anything malformed is ignored, never thrown. */
export function parseHomeParams(raw: RawHomeParams, nowMs: number): HomeParams {
  const monthRaw = first(raw.month);
  const thisMonth = monthOf(nowMs);
  const range = parseRange(first(raw.from), first(raw.to));
  const rangeMonth = range ? monthOfWholeRange(range, nowMs) : null;
  const askedMonth = monthRaw !== null && MONTH_KEY.test(monthRaw) && monthRaw <= thisMonth ? monthRaw : null;
  const month = rangeMonth ?? askedMonth;
  const viewRaw = first(raw.view);
  const view = FILTER_VIEWS.find((candidate) => candidate === viewRaw) ?? null;
  const categoryRaw = first(raw.category);
  const categoryId = categoryRaw !== null && categoryRaw.length <= MAX_CATEGORY_ID_LENGTH ? categoryRaw : null;
  return {
    month,
    range: rangeMonth ? null : range,
    view,
    categoryId,
    isAdd: first(raw.add) === "1",
    isSort: viewRaw === "unsorted",
  };
}

/** Every `YYYY-MM` the range touches, oldest first, at most four. */
export function monthsCovering(range: DayRange): string[] {
  const last = monthOf(range.to);
  const months: string[] = [];
  for (let month = monthOf(range.from); month <= last && months.length < MAX_RANGE_MONTHS; month = shiftMonth(month, 1)) {
    months.push(month);
  }
  return months;
}

/** The days on screen: the range, else the whole month. */
export function windowRange(month: string, range: DayRange | null): DayRange {
  return range ?? monthBounds(month);
}

/** The month the ‹ › arrows step from: a range belongs to its last day's month. */
export function windowMonth(month: string, range: DayRange | null): string {
  return range ? monthOf(range.to) : month;
}

export function isInRange(date: string, range: DayRange): boolean {
  return date >= range.from && date <= range.to;
}

function dayAndMonth(date: string): { day: number; month: string; year: string } {
  return { day: Number(date.slice(8, 10)), month: SHORT_MONTHS[Number(date.slice(5, 7)) - 1] ?? "", year: date.slice(0, 4) };
}

/** "20–26 Oct", "28 Sep – 4 Oct", "3 Oct"; a year only when it isn't this year. */
export function rangeLabel(range: DayRange, nowMs: number): string {
  const thisYear = manilaToday(nowMs).slice(0, 4);
  const a = dayAndMonth(range.from);
  const b = dayAndMonth(range.to);
  const yearOf = (part: { year: string }) => (part.year === thisYear ? "" : ` ${part.year}`);
  if (range.from === range.to) return `${a.day} ${a.month}${yearOf(a)}`;
  if (a.month === b.month && a.year === b.year) return `${a.day}–${b.day} ${b.month}${yearOf(b)}`;
  return `${a.day} ${a.month}${a.year === b.year ? "" : yearOf(a)} – ${b.day} ${b.month}${yearOf(b)}`;
}

interface WindowWords {
  month: string;
  range: DayRange | null;
}

/** "October · All branches", "20–26 Oct · Main". */
export function homeSubtitle(input: WindowWords & { branchLabel: string | null }, nowMs: number): string {
  const when = input.range ? rangeLabel(input.range, nowMs) : monthLabel(input.month, nowMs);
  return input.branchLabel ? `${when} · ${input.branchLabel}` : when;
}

/** "Spent in October", "Spent 20–26 Oct", "… · filtered". */
export function heroEyebrow(input: WindowWords & { isFiltered: boolean }, nowMs: number): string {
  const when = input.range ? `Spent ${rangeLabel(input.range, nowMs)}` : `Spent in ${monthLabel(input.month, nowMs)}`;
  return input.isFiltered ? `${when} · filtered` : when;
}

export interface Comparison {
  previousMonth: string;
  /** Last day of the previous month that counts; null = the whole month. */
  throughDay: string | null;
  /** "1–22 Sep" or "Sep". */
  label: string;
}

/**
 * What a month is compared with. This month so far is held against the same
 * days of last month, so on the 5th it isn't "down 85%"; a finished month is
 * held against the whole month before.
 */
export function comparisonFor(month: string, nowMs: number): Comparison {
  const previousMonth = shiftMonth(month, -1);
  const previousName = SHORT_MONTHS[Number(previousMonth.slice(5, 7)) - 1] ?? previousMonth;
  if (month !== monthOf(nowMs)) return { previousMonth, throughDay: null, label: previousName };
  const today = Number(manilaToday(nowMs).slice(8, 10));
  const { to: lastDay } = monthBounds(previousMonth);
  const day = Math.min(today, Number(lastDay.slice(8, 10)));
  const throughDay = `${previousMonth}-${String(day).padStart(2, "0")}`;
  return { previousMonth, throughDay, label: day === 1 ? `1 ${previousName}` : `1–${day} ${previousName}` };
}

/** "Up 9% vs Sep", "Down 12% vs 1–22 Sep", "Same as Sep"; null = nothing to compare with. */
export function changeText(change: Change | null, label: string): string | null {
  if (change === null) return null;
  if (change.direction === "same") return `Same as ${label}`;
  return `${change.direction === "up" ? "Up" : "Down"} ${change.percent}% vs ${label}`;
}
