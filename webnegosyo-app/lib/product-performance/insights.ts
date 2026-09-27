/**
 * The two or three sentences a merchant reads before any number on a
 * product's performance page — plain words, one idea each.
 *
 * Deliberately few. A wall of "insights" reads like a report; three short
 * lines read like someone telling you what matters.
 */

import { formatPeso } from "../format";
import type { ProductPerformance } from "./aggregate";

export type InsightTone = "up" | "down" | "neutral" | "tip";

export interface Insight {
  tone: InsightTone;
  text: string;
}

const MAX_INSIGHTS = 3;

/** A favourite has to actually lead, not win a coin toss. */
const FAVOURITE_MIN_SHARE = 0.4;

/** Below one in ten, "1 in 14" stops meaning much to anyone. */
const ADDON_MIN_ATTACH = 0.1;

/** Add-ons worth mentioning are at least this share of the item's sales. */
const ADDON_REVENUE_MIN_SHARE = 0.03;

function percent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

/** 0.25 → "1 in 4". */
export function formatOneIn(rate: number): string {
  return `1 in ${Math.max(1, Math.round(1 / rate))}`;
}

function trendInsight(product: ProductPerformance): Insight | null {
  if (product.salesChange === null) return null;
  const rounded = Math.round(product.salesChange * 100);
  if (rounded === 0) return { tone: "neutral", text: "Sales are level with the period before." };
  return rounded > 0
    ? { tone: "up", text: `Sales are up ${percent(product.salesChange)} on the period before.` }
    : { tone: "down", text: `Sales are down ${percent(product.salesChange)} on the period before.` };
}

function favouriteInsight(product: ProductPerformance): Insight | null {
  const group = product.variationGroups.find((g) => g.options.length >= 2);
  const top = group?.options[0];
  if (!group || !top || top.share < FAVOURITE_MIN_SHARE) return null;
  return {
    tone: "neutral",
    text: `Most people pick ${top.name} — ${percent(top.share)} of ${product.name} sold.`,
  };
}

function addonAttachInsight(product: ProductPerformance): Insight | null {
  const top = [...product.addons].sort((a, b) => b.attachRate - a.attachRate)[0];
  if (!top || top.attachRate < ADDON_MIN_ATTACH) return null;
  const text =
    top.attachRate >= 0.5
      ? `${top.name} goes with ${percent(top.attachRate)} of them.`
      : `${formatOneIn(top.attachRate)} add ${top.name}.`;
  return { tone: "tip", text };
}

function addonRevenueInsight(product: ProductPerformance): Insight | null {
  if (product.addonRevenue <= 0 || product.sales <= 0) return null;
  const share = product.addonRevenue / product.sales;
  if (share < ADDON_REVENUE_MIN_SHARE) return null;
  const amount = formatPeso(product.addonRevenue, 0);
  return {
    tone: "neutral",
    text: `Add-ons brought in ${product.addonRevenueIsEstimate ? "about " : ""}${amount} — ${percent(share)} of this item's sales.`,
  };
}

export function buildProductInsights(product: ProductPerformance): Insight[] {
  if (product.units <= 0) return [];
  return [
    trendInsight(product),
    favouriteInsight(product),
    addonAttachInsight(product),
    addonRevenueInsight(product),
  ]
    .filter((insight): insight is Insight => insight !== null)
    .slice(0, MAX_INSIGHTS);
}
