/** Pure product analytics; keep in sync with the merchant app backends/product-analytics-compute.ts. */
const DAY_MS = 24 * 60 * 60 * 1000;

export type ProductPeriod = "7d" | "30d" | "all";

export interface ProductOrder {
  id: string;
  createdAtMs: number;
  status: string;
}

export interface ProductOrderItem {
  orderId: string;
  menuItemId: string | null;
  menuItemName: string;
  quantity: number;
  subtotal: number;
}

export interface ProductCost {
  menuItemId: string;
  costPrice: number;
}

export type BcgClassification = "star" | "plowhorse" | "puzzle" | "dog" | "unclassified";
export type RevenueTrend = "growing" | "declining" | "stable";

/** One row in the shape `productAnalytics:getAll` returns on Convex. */
export interface ProductAnalyticsRow {
  menuItemId: string;
  menuItemName: string;
  period: ProductPeriod;
  totalUnitsSold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPercent?: number;
  avgDailyUnits: number;
  revenueTrend: RevenueTrend;
  bcgClassification: BcgClassification;
  recommendation: string;
  pairingRecommendation?: string;
  pairingItemId?: string;
  pairingReason?: string;
  lastOrderDate?: number;
  computedAt: number;
}

export interface ProductAnalyticsInput {
  orders: readonly ProductOrder[];
  items: readonly ProductOrderItem[];
  costs: readonly ProductCost[];
  period: ProductPeriod;
  nowMs: number;
}

const PERIODS: readonly ProductPeriod[] = ["7d", "30d", "all"];
const PERIOD_DAYS: Record<Exclude<ProductPeriod, "all">, number> = { "7d": 7, "30d": 30 };

const MIN_ORDERS_FOR_CLASSIFICATION = 5;
const MIN_PRODUCTS_FOR_MEDIAN = 2;
const PRICE_SUGGESTION_CAP = 0.2; // +/- 20%
const TREND_BAND = 0.1; // +/- 10% counts as stable
const LOW_MARGIN_PLOWHORSE_PERCENT = 15;

export function resolveProductPeriod(value: unknown): ProductPeriod {
  return PERIODS.includes(value as ProductPeriod) ? (value as ProductPeriod) : "30d";
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// --- aggregation ---------------------------------------------------------------

interface ItemStats {
  menuItemId: string;
  menuItemName: string;
  totalUnitsSold: number;
  totalRevenue: number;
  lastOrderDate: number;
}

function groupItemsByOrder(items: readonly ProductOrderItem[]): Map<string, ProductOrderItem[]> {
  const byOrder = new Map<string, ProductOrderItem[]>();
  for (const item of items) {
    byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);
  }
  return byOrder;
}

function tallyItems(
  orders: readonly ProductOrder[],
  itemsByOrder: Map<string, ProductOrderItem[]>
): Map<string, ItemStats> {
  const stats = new Map<string, ItemStats>();
  for (const order of orders) {
    for (const item of itemsByOrder.get(order.id) ?? []) {
      if (!item.menuItemId) continue;
      const existing = stats.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        totalUnitsSold: 0,
        totalRevenue: 0,
        lastOrderDate: 0,
      };
      stats.set(item.menuItemId, {
        ...existing,
        totalUnitsSold: existing.totalUnitsSold + item.quantity,
        totalRevenue: existing.totalRevenue + item.subtotal,
        lastOrderDate: Math.max(existing.lastOrderDate, order.createdAtMs),
      });
    }
  }
  return stats;
}

function daysInPeriod(period: ProductPeriod, activeOrders: readonly ProductOrder[], nowMs: number): number {
  if (period !== "all") return PERIOD_DAYS[period];
  if (activeOrders.length === 0) return 1;
  const first = Math.min(...activeOrders.map((o) => o.createdAtMs));
  return Math.max(1, Math.ceil((nowMs - first) / DAY_MS));
}

// --- classification ---------------------------------------------------------

interface Classified extends ItemStats {
  totalCost: number;
  totalProfit: number;
  marginPercent?: number;
  avgDailyUnits: number;
  bcgClassification: BcgClassification;
}

function isEligible(p: { marginPercent?: number; totalUnitsSold: number }): boolean {
  return p.marginPercent !== undefined && p.totalUnitsSold >= MIN_ORDERS_FOR_CLASSIFICATION;
}

function quadrant(p: Classified, medianSales: number, medianMargin: number): BcgClassification {
  if (!isEligible(p)) return "unclassified";
  const margin = p.marginPercent as number;
  const highSales = p.avgDailyUnits >= medianSales;
  const highMargin = margin >= medianMargin;
  if (highSales && highMargin) return "star";
  if (highSales) return "plowhorse";
  if (highMargin) return "puzzle";
  return "dog";
}

function classify(
  stats: readonly ItemStats[],
  costByItem: Map<string, number>,
  days: number
): { products: Classified[]; medianMargin: number } {
  const products: Classified[] = stats.map((s) => {
    const costPrice = costByItem.get(s.menuItemId);
    const hasCost = costPrice !== undefined;
    const totalCost = hasCost ? s.totalUnitsSold * costPrice : 0;
    const totalProfit = hasCost ? s.totalRevenue - totalCost : 0;
    const marginPercent =
      hasCost && s.totalRevenue > 0 ? round((totalProfit / s.totalRevenue) * 100, 1) : undefined;
    return {
      ...s,
      totalCost,
      totalProfit,
      marginPercent,
      avgDailyUnits: s.totalUnitsSold / days,
      bcgClassification: "unclassified",
    };
  });

  const eligible = products.filter(isEligible);
  if (eligible.length < MIN_PRODUCTS_FOR_MEDIAN) {
    return { products, medianMargin: 0 };
  }

  const medianSales = median(eligible.map((p) => p.avgDailyUnits));
  const medianMargin = median(eligible.map((p) => p.marginPercent as number));

  return {
    products: products.map((p) => ({ ...p, bcgClassification: quadrant(p, medianSales, medianMargin) })),
    medianMargin,
  };
}

// --- recommendations -----------------------------------------------------------

function recommendationFor(p: Classified, medianMargin: number, costPrice: number | undefined): string {
  const hasPricing = !!costPrice && costPrice > 0 && p.totalRevenue > 0;
  const currentPrice = hasPricing ? p.totalRevenue / p.totalUnitsSold : 0;

  switch (p.bcgClassification) {
    case "star": {
      if (hasPricing) {
        const suggestedIncrease = Math.min(
          currentPrice * PRICE_SUGGESTION_CAP,
          currentPrice * ((medianMargin + 10) / 100) - (currentPrice - (costPrice as number))
        );
        if (suggestedIncrease > 1) {
          return `Protect this item. Consider a slight price increase of +₱${Math.round(suggestedIncrease)} to maximize profit.`;
        }
      }
      return "Protect this item. It's your best performer — high sales and high margins.";
    }
    case "plowhorse": {
      if (hasPricing) {
        const targetPrice = (costPrice as number) / (1 - medianMargin / 100);
        const diff = Math.round(targetPrice - currentPrice);
        const cappedDiff = Math.min(diff, Math.round(currentPrice * PRICE_SUGGESTION_CAP));
        if (cappedDiff > 0) {
          return `Popular but thin margins. Raise price by ₱${cappedDiff} to improve profitability. Don't remove — it drives traffic.`;
        }
      }
      return "Popular but thin margins. Reduce portion cost or raise price slightly. Don't remove — it drives traffic.";
    }
    case "puzzle":
      return "High profit per sale but low orders. Feature it prominently, add it to upsell pairs, or bundle with a Star item.";
    case "dog":
      return "Not selling and not profitable. Consider reworking the recipe/price, or replacing with a new item.";
    default:
      return "Add cost price and accumulate orders to unlock insights.";
  }
}

const byMarginDesc = (a: Classified, b: Classified) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0);
const bySalesDesc = (a: Classified, b: Classified) => b.avgDailyUnits - a.avgDailyUnits;

function ofClass(products: readonly Classified[], ...classes: BcgClassification[]): Classified[] {
  return products.filter((p) => classes.includes(p.bcgClassification));
}

function first(...candidates: Classified[][]): Classified | undefined {
  for (const list of candidates) {
    if (list.length > 0) return list[0];
  }
  return undefined;
}

function pairingFor(
  p: Classified,
  all: readonly Classified[]
): { pairingRecommendation: string; pairingItemId: string; pairingReason: string } | null {
  if (p.bcgClassification === "unclassified") return null;
  const others = all.filter((o) => o.menuItemId !== p.menuItemId && o.bcgClassification !== "unclassified");
  if (others.length === 0) return null;

  let target: Classified | undefined;
  let reason = "";

  switch (p.bcgClassification) {
    case "star":
      target = first([...ofClass(others, "puzzle")].sort(byMarginDesc), [...others].sort(byMarginDesc));
      reason = target
        ? `Promote alongside ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) — suggest it as an add-on when customers order this best-seller.`
        : "";
      break;
    case "plowhorse":
      target = first(
        [...ofClass(others, "star", "puzzle")].sort(byMarginDesc),
        [...others].sort(byMarginDesc)
      );
      reason = target
        ? `Cross-promote with ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) — suggest it as an add-on to lift combined margins on this high-traffic item.`
        : "";
      break;
    case "puzzle":
      target = first(
        [...ofClass(others, "star", "plowhorse")].sort(bySalesDesc),
        [...others].sort(bySalesDesc)
      );
      reason = target
        ? `Feature alongside ${target.menuItemName} (${target.bcgClassification}, ${target.avgDailyUnits.toFixed(1)} units/day) — leverage its traffic to get this profitable item more visibility.`
        : "";
      break;
    case "dog":
      target = first(
        [...ofClass(others, "star")].sort(bySalesDesc),
        [...ofClass(others, "plowhorse")].sort(bySalesDesc),
        [...others].sort(bySalesDesc)
      );
      reason = target
        ? `If keeping, promote alongside ${target.menuItemName} (${target.bcgClassification}) — leverage its popularity to move this underperformer.`
        : "";
      break;
  }

  if (!target || !reason) return null;
  return {
    pairingRecommendation: `Cross-promote with ${target.menuItemName}.`,
    pairingItemId: target.menuItemId,
    pairingReason: reason,
  };
}

// --- trend --------------------------------------------------------------------------

function trendFor(currentUnitsPerDay: number, prevUnitsPerDay: number): RevenueTrend {
  if (prevUnitsPerDay === 0 && currentUnitsPerDay === 0) return "stable";
  if (prevUnitsPerDay === 0) return "growing";
  if (currentUnitsPerDay > prevUnitsPerDay * (1 + TREND_BAND)) return "growing";
  if (currentUnitsPerDay < prevUnitsPerDay * (1 - TREND_BAND)) return "declining";
  return "stable";
}

/** Units per day in the week BEFORE the 7d window, per item. */
function previousWeekUnits(
  activeOrders: readonly ProductOrder[],
  itemsByOrder: Map<string, ProductOrderItem[]>,
  cutoffMs: number
): Map<string, number> {
  const prevOrders = activeOrders.filter(
    (o) => o.createdAtMs >= cutoffMs - 7 * DAY_MS && o.createdAtMs < cutoffMs
  );
  const units = new Map<string, number>();
  for (const [id, stats] of tallyItems(prevOrders, itemsByOrder)) {
    units.set(id, stats.totalUnitsSold / 7);
  }
  return units;
}

// --- entry points -------------------------------------------------------------------

export function computeProductAnalytics(input: ProductAnalyticsInput): ProductAnalyticsRow[] {
  const { period, nowMs } = input;
  const activeOrders = input.orders.filter((o) => o.status !== "cancelled");
  const cutoffMs = period === "all" ? 0 : nowMs - PERIOD_DAYS[period] * DAY_MS;
  const periodOrders = activeOrders.filter((o) => o.createdAtMs >= cutoffMs);
  const itemsByOrder = groupItemsByOrder(input.items);
  const costByItem = new Map(input.costs.map((c) => [c.menuItemId, c.costPrice]));

  const stats = Array.from(tallyItems(periodOrders, itemsByOrder).values());
  const { products, medianMargin } = classify(stats, costByItem, daysInPeriod(period, activeOrders, nowMs));

  const prevUnits =
    period === "7d" ? previousWeekUnits(activeOrders, itemsByOrder, cutoffMs) : new Map<string, number>();

  return products.map((p) => ({
    menuItemId: p.menuItemId,
    menuItemName: p.menuItemName,
    period,
    totalUnitsSold: p.totalUnitsSold,
    totalRevenue: round(p.totalRevenue, 2),
    totalCost: round(p.totalCost, 2),
    totalProfit: round(p.totalProfit, 2),
    marginPercent: p.marginPercent,
    avgDailyUnits: round(p.avgDailyUnits, 1),
    revenueTrend: period === "7d" ? trendFor(p.avgDailyUnits, prevUnits.get(p.menuItemId) ?? 0) : "stable",
    bcgClassification: p.bcgClassification,
    recommendation: recommendationFor(p, medianMargin, costByItem.get(p.menuItemId)),
    ...(pairingFor(p, products) ?? {}),
    lastOrderDate: p.lastOrderDate || undefined,
    computedAt: nowMs,
  }));
}

/** Mirrors `productAnalytics:getPortfolioSummary`. */
export function summarizePortfolio(rows: readonly ProductAnalyticsRow[]) {
  const counts: Record<BcgClassification, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0, unclassified: 0 };
  let totalRevenue = 0;
  let starRevenue = 0;

  for (const row of rows) {
    counts[row.bcgClassification] += 1;
    totalRevenue += row.totalRevenue;
    if (row.bcgClassification === "star") starRevenue += row.totalRevenue;
  }

  return {
    counts,
    totalProducts: rows.length,
    starRevenuePercent: totalRevenue > 0 ? round((starRevenue / totalRevenue) * 100, 1) : 0,
    lowMarginPlowhorses: rows
      .filter(
        (r) =>
          r.bcgClassification === "plowhorse" &&
          r.marginPercent !== undefined &&
          r.marginPercent < LOW_MARGIN_PLOWHORSE_PERCENT
      )
      .map((r) => ({ menuItemId: r.menuItemId, marginPercent: r.marginPercent })),
  };
}
