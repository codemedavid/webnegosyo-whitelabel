/**
 * What the Sales Overview draws, decided from the server's answer. Pure, so
 * the sentences and the chart's numbers are tested without rendering.
 */

import { describeChange, formatMetric } from "./format";
import type { CompareTo, MetricDef, MetricId, ReportPreset, ReportRow, ReportSections } from "./types";

/** The period chips, in the order an owner reaches for them. Custom opens the calendar. */
export const OVERVIEW_PRESETS: readonly { label: string; value: ReportPreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 days", value: "last_7_days" },
  { label: "30 days", value: "last_30_days" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "This year", value: "this_year" },
  { label: "12 months", value: "last_12_months" },
  { label: "Pick dates", value: "custom" },
];

export const COMPARE_OPTIONS: readonly { label: string; value: CompareTo }[] = [
  { label: "vs before", value: "previous" },
  { label: "vs last year", value: "last_year" },
  { label: "No compare", value: "none" },
];

/** The trend's metric tabs, when the rows carry them. */
const TREND_METRICS: readonly MetricId[] = ["net_sales", "orders", "aov", "gross_profit"];

export interface TrendBar {
  key: string;
  label: string;
  value: number;
  previous: number | null;
}

export interface Trend {
  metric: MetricDef;
  bars: TrendBar[];
  max: number;
}

export function trendMetrics(rows: readonly ReportRow[], metrics: readonly MetricDef[]): MetricDef[] {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  return TREND_METRICS.flatMap((id) => {
    const metric = byId.get(id);
    return metric && rows.some((row) => row.values[id] !== undefined) ? [metric] : [];
  });
}

export function buildTrend(rows: readonly ReportRow[], metric: MetricDef): Trend {
  const bars = rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.values[metric.id] ?? 0,
    previous: row.previous ? (row.previous[metric.id] ?? null) : null,
  }));
  const max = Math.max(0, ...bars.map((bar) => Math.max(bar.value, bar.previous ?? 0)));
  return { metric, bars, max };
}

/** The bars to name under the chart: the first, the last and up to `between` spread evenly between them. */
export function labelledBarIndexes(count: number, between = 1): number[] {
  if (count <= 0) return [];
  if (count <= between + 2) return Array.from({ length: count }, (_, index) => index);
  const step = (count - 1) / (between + 1);
  return Array.from({ length: between + 2 }, (_, index) => Math.round(index * step));
}

export interface ChangeLine {
  key: string;
  text: string;
  tone: "good" | "bad" | "neutral";
  /** Where tapping it leads. */
  target: "items" | "orders" | null;
}

function biggestMover(items: readonly ReportRow[]): { row: ReportRow; change: number } | null {
  let best: { row: ReportRow; change: number } | null = null;
  for (const row of items) {
    if (row.previous === undefined) return null;
    const change = (row.values.net_sales ?? 0) - (row.previous?.net_sales ?? 0);
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { row, change };
  }
  return best && best.change !== 0 ? best : null;
}

/**
 * Up to three plain sentences, each with its numbers: how sales moved, which
 * dish moved them most, and money still to collect. Never a guess: a line
 * is left out when its figures are missing.
 */
export function whatChanged(sections: ReportSections, metrics: readonly MetricDef[], comparePhrase: string | null): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const net = metrics.find((metric) => metric.id === "net_sales");
  const summary = sections.summary?.ok ? sections.summary.data : null;
  if (summary && net && summary.previous && comparePhrase) {
    const change = describeChange(summary.values.net_sales, summary.previous.net_sales, net);
    if (change.arrow !== "flat") {
      const verb = change.arrow === "up" ? "up" : "down";
      lines.push({ key: "sales", text: `Sales are ${verb} ${change.text.slice(2)} ${comparePhrase}.`, tone: change.tone, target: null });
    }
  }
  const items = sections.items?.ok ? sections.items.data.rows : [];
  const mover = biggestMover(items);
  if (mover) {
    const amount = formatMetric(Math.abs(mover.change), "money");
    const text = mover.change > 0 ? `${mover.row.label} brought in ${amount} more than before.` : `${mover.row.label} sold ${amount} less than before.`;
    lines.push({ key: "mover", text, tone: mover.change > 0 ? "good" : "bad", target: "items" });
  }
  const unpaid = summary?.values.still_to_collect ?? 0;
  if (unpaid > 0) {
    lines.push({ key: "unpaid", text: `${formatMetric(unpaid, "money")} is still to collect.`, tone: "neutral", target: "orders" });
  }
  return lines.slice(0, 3);
}

export interface ShareRow {
  key: string;
  label: string;
  valueText: string;
  share: number;
  detail: string | null;
}

/** The largest rows of a breakdown, with each one's share of the whole (0..1). */
export function shareRows(rows: readonly ReportRow[], metric: MetricId, format: MetricDef["format"], limit: number, detailOf?: (row: ReportRow) => string | null): ShareRow[] {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.values[metric] ?? 0), 0);
  return rows.slice(0, limit).map((row) => {
    const value = row.values[metric] ?? 0;
    return {
      key: row.key,
      label: row.label,
      valueText: formatMetric(value, format),
      share: total > 0 ? Math.max(0, value) / total : 0,
      detail: detailOf ? detailOf(row) : null,
    };
  });
}
