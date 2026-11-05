/**
 * How a report figure reads on the phone. The server sends raw values
 * (centavos, counts, fractions) and each metric's format; this is the only
 * place they become text. Pure.
 */

import type { MetricDef, MetricFormat } from "./types";

const MINUS = "−";

function withSeparators(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(cents: number): string {
  const pesos = Math.round(Math.abs(cents) / 100);
  const text = `₱${withSeparators(pesos)}`;
  return cents < 0 && pesos !== 0 ? `${MINUS}${text}` : text;
}

/** "₱12,345", "1,204", "4.3", "34.6%"; "—" when there is no figure. */
export function formatMetric(value: number | null | undefined, format: MetricFormat): string {
  if (!isNumber(value)) return "—";
  switch (format) {
    case "money":
      return money(value);
    case "count":
      return `${value < 0 ? MINUS : ""}${withSeparators(Math.round(Math.abs(value)))}`;
    case "decimal":
      return value.toFixed(1);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
  }
}

/** For chart labels: "₱45.6k", "₱1.3M", "50%". */
export function formatMetricShort(value: number | null | undefined, format: MetricFormat): string {
  if (!isNumber(value)) return "—";
  if (format === "percent") return `${Math.round(value * 100)}%`;
  const amount = format === "money" ? value / 100 : value;
  const prefix = format === "money" ? "₱" : "";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : "";
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${prefix}${format === "decimal" ? abs.toFixed(1) : Math.round(abs)}`;
}

export type ChangeTone = "good" | "bad" | "neutral";

export interface ChangeText {
  /** "▲ ₱200 (+20%)", "▼ 5.0 pts", "Same as before". */
  text: string;
  tone: ChangeTone;
  arrow: "up" | "down" | "flat";
}

function toneOf(isUp: boolean, def: Pick<MetricDef, "goodDirection">): ChangeTone {
  if (def.goodDirection === "none") return "neutral";
  return isUp === (def.goodDirection === "up") ? "good" : "bad";
}

function percentChange(current: number, previous: number): string {
  const ratio = (current - previous) / Math.abs(previous);
  const rounded = Math.round(Math.abs(ratio) * 100);
  return `${ratio >= 0 ? "+" : MINUS}${rounded}%`;
}

/**
 * The change from the compared period, in the metric's own unit plus a
 * percentage. Percentages change in points, never "% of a %". Green or red
 * follows whether that direction is good for THIS metric (food cost up = red).
 */
export function describeChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  def: Pick<MetricDef, "format" | "goodDirection">,
): ChangeText {
  if (!isNumber(current) || !isNumber(previous)) return { text: "No earlier figure", tone: "neutral", arrow: "flat" };
  const difference = current - previous;
  if (difference === 0) return { text: "Same as before", tone: "neutral", arrow: "flat" };
  const isUp = difference > 0;
  const arrow = isUp ? "▲" : "▼";
  const tone = toneOf(isUp, def);
  const direction = isUp ? "up" : "down";
  if (def.format === "percent") return { text: `${arrow} ${(Math.abs(difference) * 100).toFixed(1)} pts`, tone, arrow: direction };
  const amount = formatMetric(Math.abs(difference), def.format);
  if (previous === 0) return { text: `${arrow} ${amount} (new)`, tone, arrow: direction };
  return { text: `${arrow} ${amount} (${percentChange(current, previous)})`, tone, arrow: direction };
}
