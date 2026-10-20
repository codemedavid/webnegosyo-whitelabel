/**
 * What the Activity feed is narrowed to — one immutable state and the reducer
 * that changes it (design spec §3.1 quick chips, §3.2 filter sheet).
 *
 * Pure so the screen, the sheet and the chips under the header cannot
 * disagree about what is on, and so a deep link (staff profile, ingredient
 * page) is just an initial state. Periods are Asia/Manila days: the store's
 * day is the unit an owner thinks in, wherever the phone is.
 */

import { actorFirstName } from "./describe";
import type { ActivityQuery } from "./activity-repo";
import { manilaDayKey } from "./format";
import { CATEGORY_LABELS, type ActivityCategory, type ActivitySubjectType } from "./taxonomy";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DAYS = 7;

export type ActivityPeriod = "today" | "yesterday" | "last7" | "month" | "custom";

export const PERIOD_LABELS: Readonly<Record<ActivityPeriod, string>> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  month: "This month",
  custom: "Picked dates",
};

/** Quick chip values: everything, open flags, or one category. */
export type QuickFilter = "all" | "needs_look" | ActivityCategory;

export interface ActivityRange {
  since: string;
  until: string;
}

export interface ActivityActorFilter {
  id: string;
  name: string;
}

export interface ActivitySubjectFilter {
  type: ActivitySubjectType;
  ref: string;
  /** What the chip says: "#14", "Rice". */
  label: string;
}

export interface ActivityFilters {
  period: ActivityPeriod;
  customRange: ActivityRange | null;
  /** Empty = every category the account may see. */
  categories: readonly ActivityCategory[];
  flaggedOnly: boolean;
  actor: ActivityActorFilter | null;
  /** A branch picked in the sheet (store-wide accounts only). */
  outletId: string | null;
  includeRoutine: boolean;
  search: string;
  subject: ActivitySubjectFilter | null;
}

/** A feed with day headers wants more than one day, so the default is a week. */
export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
  period: "last7",
  customRange: null,
  categories: [],
  flaggedOnly: false,
  actor: null,
  outletId: null,
  includeRoutine: false,
  search: "",
  subject: null,
};

export type FilterChipKey = "period" | "actor" | "outlet" | "subject" | "routine" | "search";

export interface ActivityFilterChip {
  key: FilterChipKey;
  label: string;
}

export type ActivityFilterAction =
  | { type: "quick"; value: QuickFilter }
  | { type: "setPeriod"; period: ActivityPeriod; range?: ActivityRange | null }
  | { type: "toggleCategory"; category: ActivityCategory }
  | { type: "setActor"; actor: ActivityActorFilter | null }
  | { type: "setOutlet"; outletId: string | null }
  | { type: "setIncludeRoutine"; value: boolean }
  | { type: "setSearch"; text: string }
  | { type: "setSubject"; subject: ActivitySubjectFilter | null }
  | { type: "removeChip"; key: FilterChipKey }
  | { type: "replace"; filters: ActivityFilters }
  | { type: "reset" };

function manilaMidnight(nowIso: string, daysAgo: number): string {
  const today = manilaDayKey(nowIso);
  const midnightUtc = Date.parse(`${today}T00:00:00.000Z`) - MANILA_OFFSET_MS;
  return new Date(midnightUtc - daysAgo * DAY_MS).toISOString();
}

function monthStart(nowIso: string): string {
  const firstOfMonth = `${manilaDayKey(nowIso).slice(0, 8)}01`;
  return new Date(Date.parse(`${firstOfMonth}T00:00:00.000Z`) - MANILA_OFFSET_MS).toISOString();
}

/** The [since, until) a period covers; `until: null` means "up to now". */
export function periodWindow(
  period: ActivityPeriod,
  customRange: ActivityRange | null,
  nowIso: string,
): { since: string; until: string | null } {
  switch (period) {
    case "today":
      return { since: manilaMidnight(nowIso, 0), until: null };
    case "yesterday":
      return { since: manilaMidnight(nowIso, 1), until: manilaMidnight(nowIso, 0) };
    case "month":
      return { since: monthStart(nowIso), until: null };
    case "custom":
      return customRange ? { since: customRange.since, until: customRange.until } : periodWindow("last7", null, nowIso);
    default:
      return { since: manilaMidnight(nowIso, LAST_DAYS - 1), until: null };
  }
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function quick(state: ActivityFilters, value: QuickFilter): ActivityFilters {
  if (value === "all") return { ...state, categories: [], flaggedOnly: false };
  if (value === "needs_look") return { ...state, categories: [], flaggedOnly: true };
  return { ...state, categories: [value], flaggedOnly: false };
}

function removeChip(state: ActivityFilters, key: FilterChipKey): ActivityFilters {
  switch (key) {
    case "period":
      return { ...state, period: DEFAULT_ACTIVITY_FILTERS.period, customRange: null };
    case "actor":
      return { ...state, actor: null };
    case "outlet":
      return { ...state, outletId: null };
    case "subject":
      return { ...state, subject: null };
    case "routine":
      return { ...state, includeRoutine: false };
    default:
      return { ...state, search: "" };
  }
}

function setPeriod(state: ActivityFilters, period: ActivityPeriod, range: ActivityRange | null): ActivityFilters {
  if (period === "custom" && !range) return { ...state, period: DEFAULT_ACTIVITY_FILTERS.period, customRange: null };
  return { ...state, period, customRange: period === "custom" ? range : null };
}

export function activityFiltersReducer(state: ActivityFilters, action: ActivityFilterAction): ActivityFilters {
  switch (action.type) {
    case "quick":
      return quick(state, action.value);
    case "setPeriod":
      return setPeriod(state, action.period, action.range ?? null);
    case "toggleCategory":
      return { ...state, categories: toggle(state.categories, action.category) };
    case "setActor":
      return { ...state, actor: action.actor };
    case "setOutlet":
      return { ...state, outletId: action.outletId };
    case "setIncludeRoutine":
      return { ...state, includeRoutine: action.value };
    case "setSearch":
      return { ...state, search: action.text };
    case "setSubject":
      return { ...state, subject: action.subject };
    case "removeChip":
      return removeChip(state, action.key);
    case "replace":
      return action.filters;
    default:
      return DEFAULT_ACTIVITY_FILTERS;
  }
}

/** Which quick chip reads as selected; null when the sheet picked several kinds. */
export function activeQuickFilter(state: ActivityFilters): QuickFilter | null {
  if (state.flaggedOnly) return state.categories.length === 0 ? "needs_look" : null;
  if (state.categories.length === 0) return "all";
  return state.categories.length === 1 ? state.categories[0] : null;
}

export interface QuickFilterViewer {
  isOwner: boolean;
  /** Owner, activity_view or approve_requests: sees the store and its flags. */
  isFullViewer: boolean;
  flaggedOpen: number;
}

const QUICK_CATEGORIES: readonly ActivityCategory[] = ["orders", "money", "stock", "cash", "loyalty", "menu"];

export function quickFilterOptions(viewer: QuickFilterViewer): { label: string; value: QuickFilter }[] {
  const needsLook =
    viewer.isFullViewer
      ? [{ label: viewer.flaggedOpen > 0 ? `Needs a look · ${viewer.flaggedOpen}` : "Needs a look", value: "needs_look" as QuickFilter }]
      : [];
  const team = viewer.isOwner ? [{ label: CATEGORY_LABELS.team, value: "team" as QuickFilter }] : [];
  return [
    { label: "All", value: "all" },
    ...needsLook,
    ...QUICK_CATEGORIES.map((category) => ({ label: CATEGORY_LABELS[category], value: category as QuickFilter })),
    ...team,
  ];
}

export interface FilterChipLabels {
  outletName: (outletId: string) => string | null;
}

export function filterChips(state: ActivityFilters, labels: FilterChipLabels): ActivityFilterChip[] {
  const chips: (ActivityFilterChip | null)[] = [
    state.period !== DEFAULT_ACTIVITY_FILTERS.period ? { key: "period", label: PERIOD_LABELS[state.period] } : null,
    state.actor ? { key: "actor", label: actorFirstName(state.actor.name) ?? state.actor.name } : null,
    state.outletId ? { key: "outlet", label: labels.outletName(state.outletId) ?? "One branch" } : null,
    state.subject ? { key: "subject", label: state.subject.label } : null,
    state.includeRoutine ? { key: "routine", label: "With routine events" } : null,
    state.search.trim() ? { key: "search", label: `“${state.search.trim()}”` } : null,
  ];
  return chips.filter((chip): chip is ActivityFilterChip => chip !== null);
}

/** How many sheet filters are on, for the "Filter · 3" chip. */
export function sheetFilterCount(state: ActivityFilters): number {
  return [
    state.period !== DEFAULT_ACTIVITY_FILTERS.period,
    state.actor !== null,
    state.outletId !== null,
    state.includeRoutine,
    state.categories.length > 1,
  ].filter(Boolean).length;
}

export interface QueryContext {
  tenantId: string;
  nowIso: string;
  /** The ACCOUNT reaches every branch; only then may the client narrow. */
  isStoreWide: boolean;
  /** The branch an owner drilled into from the portfolio, if any. */
  drilledOutletId: string | null;
}

export function toActivityQuery(state: ActivityFilters, ctx: QueryContext): Omit<ActivityQuery, "cursor" | "limit"> {
  const window = periodWindow(state.period, state.customRange, ctx.nowIso);
  return {
    tenantId: ctx.tenantId,
    since: window.since,
    until: window.until,
    categories: state.categories,
    outletId: ctx.isStoreWide ? state.outletId ?? ctx.drilledOutletId : null,
    actorUserId: state.actor?.id ?? null,
    flaggedOnly: state.flaggedOnly,
    includeRoutine: state.includeRoutine,
    search: state.search.trim() === "" ? null : state.search.trim(),
    subjectType: state.subject?.type ?? null,
    subjectRef: state.subject?.ref ?? null,
  };
}
