/**
 * Food cost, Staff and Rent as a share of sales, each with a gentle guide —
 * "Usual", "On the high side", "High" — phrased as what MOST restaurants see,
 * never as a verdict on this store (design brief: benchmarks are guides).
 *
 * Where the guides come from (widely cited restaurant-industry ranges, mostly
 * US data, not Philippine data — which is why the words stay soft):
 * - Food cost 28–35% of sales: National Restaurant Association operations
 *   reports; Restaurant365 and Toast "food cost percentage" guides.
 * - Labour 25–35% of sales: Toast and 7shifts labour-cost guides; prime cost
 *   (food + labour) 55–65% is the model's own `PRIME_COST_BAND`.
 * - Occupancy (rent) 6–10% of sales: Restaurant Resource Group and NRA
 *   occupancy-cost guides; above ~15% is widely called a problem.
 *
 * The band judges the WHOLE percent the tile shows, so "38%" is never called
 * high because it was really 38.4%. Pure.
 */

import { UNCOSTED_SHARE_LIMIT, type ProfitReport } from "./profit-model";
import { formatMoney, formatRatio, ingredientBasisLine, ingredientDetail } from "./profit-view";

export type CostKind = "food" | "staff" | "rent";
export type CostBand = "usual" | "high_side" | "high" | "unknown" | "none";
export type BandTone = "good" | "warn" | "bad" | "neutral";

interface CostGuide {
  /** The range most restaurants land in, in whole percent (for the explanation). */
  readonly usualLow: number;
  readonly usualHigh: number;
  /** Above this whole percent: "On the high side". */
  readonly highSideAbove: number;
  /** Above this whole percent: "High". */
  readonly highAbove: number;
}

export const COST_GUIDES: Readonly<Record<CostKind, CostGuide>> = {
  food: { usualLow: 28, usualHigh: 35, highSideAbove: 38, highAbove: 45 },
  staff: { usualLow: 25, usualHigh: 35, highSideAbove: 35, highAbove: 45 },
  rent: { usualLow: 6, usualHigh: 10, highSideAbove: 10, highAbove: 15 },
};

export const BAND_LABELS: Readonly<Record<CostBand, string>> = {
  usual: "Usual",
  high_side: "On the high side",
  high: "High",
  unknown: "Not enough data",
  none: "None recorded",
};

export const BAND_TONES: Readonly<Record<CostBand, BandTone>> = {
  usual: "good",
  high_side: "warn",
  high: "bad",
  unknown: "neutral",
  none: "neutral",
};

const TILE_LABELS: Readonly<Record<CostKind, string>> = { food: "Food cost", staff: "Staff", rent: "Rent" };

export function costBand(kind: CostKind, ratio: number | null): CostBand {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) return "unknown";
  const percent = Math.round(ratio * 100);
  const guide = COST_GUIDES[kind];
  if (percent > guide.highAbove) return "high";
  if (percent > guide.highSideAbove) return "high_side";
  return "usual";
}

/**
 * Food cost is banded only when the figure can carry it: a purchases-based
 * estimate can (it is labelled one), a recipe-based figure only when most
 * dishes sold had a cost — the same limit the "no recipe" finding uses.
 */
export function isFoodCostReliable(report: ProfitReport): boolean {
  if (report.ingredientBasis === "purchases") return true;
  const share = report.coverage.costedShare;
  return share !== null && 1 - share <= UNCOSTED_SHARE_LIMIT;
}

export interface CostTile {
  kind: CostKind;
  label: string;
  /** "33%", or "—" without sales. */
  valueText: string;
  band: CostBand;
  bandLabel: string;
  tone: BandTone;
}

function bandFor(kind: CostKind, report: ProfitReport): CostBand {
  if (kind === "food") {
    const ratio = report.ratios.food;
    return ratio !== null && !isFoodCostReliable(report) ? "unknown" : costBand("food", ratio);
  }
  const cents = kind === "staff" ? report.byGroup.staff : report.byGroup.occupancy;
  const ratio = kind === "staff" ? report.ratios.staff : report.ratios.rent;
  if (ratio !== null && cents === 0) return "none";
  return costBand(kind, ratio);
}

function ratioOf(kind: CostKind, report: ProfitReport): number | null {
  if (kind === "food") return report.ratios.food;
  return kind === "staff" ? report.ratios.staff : report.ratios.rent;
}

export function costTiles(report: ProfitReport): CostTile[] {
  return (["food", "staff", "rent"] as const).map((kind) => {
    const band = bandFor(kind, report);
    return {
      kind,
      label: TILE_LABELS[kind],
      valueText: formatRatio(ratioOf(kind, report)),
      band,
      bandLabel: BAND_LABELS[band],
      tone: BAND_TONES[band],
    };
  });
}

export interface CostExplanation {
  title: string;
  paragraphs: string[];
}

function guideLine(kind: CostKind): string {
  const guide = COST_GUIDES[kind];
  const range = kind === "food" ? `${guide.usualLow}–${guide.usualHigh}%` : `${guide.usualHigh}% or less`;
  return `As a guide, most restaurants land at ${range}. Above ${guide.highSideAbove}% is on the high side; above ${guide.highAbove}% is high.`;
}

const SOFT_NOTE = "These guides come from restaurant averages, not rules: a café, a bakery or a carinderia can sit differently and still do well.";

function shareLine(what: string, cents: number, report: ProfitReport, ratio: number | null): string | null {
  if (ratio === null) return null;
  return `${what}: ${formatMoney(cents)} of ${formatMoney(report.netSalesCents)} in sales, or ${formatRatio(ratio)}.`;
}

function foodExplanation(report: ProfitReport): string[] {
  const lines = [
    "Food cost is what your ingredients cost, as a share of what you sold.",
    shareLine("This period", report.ingredientCostCents, report, report.ratios.food),
    `${ingredientBasisLine(report)} ${ingredientDetail(report)}.`,
  ];
  if (report.ratios.food !== null && !isFoodCostReliable(report)) {
    const missing = report.coverage.costedShare === null ? null : report.coverage.uncostedDishes;
    lines.push(
      missing === null
        ? "We can’t give a guide here: dish costs are visible to store-wide accounts only."
        : `We can’t give a guide yet: ${missing} ${missing === 1 ? "dish has" : "dishes have"} no recipe, so this figure is too low to trust.`,
    );
  }
  return [...lines.filter((line): line is string => line !== null), guideLine("food"), SOFT_NOTE];
}

function staffExplanation(report: ProfitReport): string[] {
  const head = "Staff is wages, government contributions, staff meals and 13th month, as a share of what you sold.";
  if (report.ratios.staff !== null && report.byGroup.staff === 0) {
    return [head, "No staff costs recorded in this period. If you pay wages, record them in Expenses so profit is real.", guideLine("staff")];
  }
  const share = shareLine("This period", report.byGroup.staff, report, report.ratios.staff);
  return [head, ...(share ? [share] : []), guideLine("staff"), SOFT_NOTE];
}

function rentExplanation(report: ProfitReport): string[] {
  const head = "Rent is what your space costs, as a share of what you sold.";
  if (report.ratios.rent !== null && report.byGroup.occupancy === 0) {
    return [head, "No rent recorded in this period. If you own the space, that’s fine; if you pay rent, record it so profit is real.", guideLine("rent")];
  }
  const share = shareLine("This period", report.byGroup.occupancy, report, report.ratios.rent);
  return [head, ...(share ? [share] : []), guideLine("rent"), SOFT_NOTE];
}

/** The short sheet a tile opens: what the number is, this store's figures, and the guide. */
export function costExplanation(kind: CostKind, report: ProfitReport): CostExplanation {
  const noSales = "There were no sales in this period, so there is no share to show yet.";
  const paragraphs =
    kind === "food" ? foodExplanation(report) : kind === "staff" ? staffExplanation(report) : rentExplanation(report);
  const ratio = ratioOf(kind, report);
  return { title: TILE_LABELS[kind], paragraphs: ratio === null ? [paragraphs[0], noSales] : paragraphs };
}
