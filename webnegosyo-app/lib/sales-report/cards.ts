/**
 * The Overview's KPI cards: which figures an owner tracks (plan 2026-11-05
 * §6.1, "Edit cards"). The server says which metrics this account may see;
 * the owner's choice is kept per person (`card-prefs.ts`) and filtered
 * against that every time, so a revoked cost key never leaves a margin card
 * behind. Pure.
 */

import type { MetricDef, MetricId, MetricValues, ReportSection, ReportSections } from "./types";

export const MAX_CARDS = 8;

const DEFAULT_CARDS: readonly MetricId[] = ["net_sales", "orders", "aov", "avg_orders_per_day", "gross_margin_pct", "items_sold"];
/** Without cost access the margin card becomes the money actually received. */
const DEFAULT_CARDS_NO_COSTS: readonly MetricId[] = ["net_sales", "orders", "aov", "avg_orders_per_day", "money_received", "items_sold"];

/** A card shows one figure for the whole period. */
function isCardMetric(metric: MetricDef): boolean {
  return metric.scopes.includes("summary");
}

export function cardChoices(visible: readonly MetricDef[]): MetricDef[] {
  return visible.filter(isCardMetric);
}

export function resolveCards(chosen: readonly MetricId[] | null, visible: readonly MetricDef[]): MetricDef[] {
  const byId = new Map(cardChoices(visible).map((metric) => [metric.id, metric]));
  const pick = (ids: readonly MetricId[]) => ids.flatMap((id) => byId.get(id) ?? []).slice(0, MAX_CARDS);
  const own = chosen ? pick(chosen) : [];
  if (own.length > 0) return own;
  const canSeeCosts = visible.some((metric) => metric.permission === "costs");
  return pick(canSeeCosts ? DEFAULT_CARDS : DEFAULT_CARDS_NO_COSTS);
}

export function toggleCard(cards: readonly MetricId[], id: MetricId): MetricId[] {
  if (cards.includes(id)) return cards.filter((card) => card !== id);
  return cards.length >= MAX_CARDS ? [...cards] : [...cards, id];
}

export function moveCard(cards: readonly MetricId[], id: MetricId, step: -1 | 1): MetricId[] {
  const index = cards.indexOf(id);
  const target = index + step;
  if (index < 0 || target < 0 || target >= cards.length) return [...cards];
  const next = [...cards];
  next[index] = cards[target];
  next[target] = id;
  return next;
}

/** One request answers the whole Overview (the server allows six sections). */
export function overviewSections(canSeeCosts: boolean): ReportSection[] {
  const base: ReportSection[] = ["summary", "periods", "items", "order_types", "payments"];
  return canSeeCosts ? [...base, "profit"] : base;
}

/** Card figures: the totals, with the cost figures from the profit section when it answered. */
export function cardValues(
  summary: ReportSections["summary"],
  profit: ReportSections["profit"],
): { current: MetricValues; previous: MetricValues | null } {
  const totals = summary?.ok ? summary.data : null;
  const costs = profit?.ok ? profit.data : null;
  const current = { ...(totals?.values ?? {}), ...(costs?.values ?? {}) };
  const previous = totals?.previous ? { ...totals.previous, ...(costs?.previous ?? {}) } : null;
  return { current, previous };
}
