// Pure growth-math for the Growth tab: period averages, week/month revenue
// buckets, the Hormozi-style bottleneck diagnosis (customers → AOV → margin),
// and the "orders needed to hit a target" calculator. No React, no Convex —
// mirrors lib/analytics-utils.ts so everything stays unit-testable.

export interface DailyTrend {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

export interface GrowthSummary {
  totalOrders: number;
  totalRevenue: number;
  /** Orders ÷ full period length, not just days with sales. */
  avgOrdersPerDay: number;
  avgRevenuePerDay: number;
  avgRevenuePerWeek: number;
  avgRevenuePerMonth: number;
  /** Revenue ÷ orders — the revenue:orders ratio. */
  avgOrderValue: number;
  /** Days in the period that had at least one order. */
  activeDays: number;
  /** Revenue ÷ unique customers; only when a customer count is known. */
  revenuePerCustomer?: number;
}

export interface GrowthSummaryOptions {
  /** Calendar length of the selected period (e.g. 30 for "30 days"). */
  periodDays: number;
  /** Unique customer count for the same period, when available. */
  totalCustomers?: number;
}

export interface PeriodBucket {
  label: string;
  revenue: number;
  orders: number;
}

export type GrowthBottleneck = "no-data" | "customers" | "aov" | "margin" | "healthy";

export interface GrowthDiagnosis {
  bottleneck: GrowthBottleneck;
  title: string;
  advice: string;
}

export interface GrowthDiagnosisInput {
  avgOrdersPerDay: number;
  avgOrderValue: number;
  totalOrders: number;
  /** Portfolio-average margin %, when product costs are set. */
  marginPercent?: number;
}

export interface GrowthBenchmarks {
  minOrdersPerDay: number;
  minAov: number;
  minMarginPercent: number;
}

export interface ScaleTargetInput {
  targetMonthlyRevenue: number;
  avgOrderValue: number;
  avgOrdersPerDay: number;
}

export interface ScaleTarget {
  ordersNeededPerMonth: number;
  ordersNeededPerDay: number;
  /** Extra orders/day on top of the current pace; never negative. */
  additionalOrdersPerDay: number;
  /** The AOV that hits the target without adding a single order. */
  aovNeededAtCurrentVolume: number;
}

const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// Sensible floors for a small PH restaurant; screens can override per tenant.
export const DEFAULT_BENCHMARKS: GrowthBenchmarks = {
  minOrdersPerDay: 10,
  minAov: 150,
  minMarginPercent: 25,
};

const DIAGNOSIS_COPY: Record<GrowthBottleneck, { title: string; advice: string }> = {
  "no-data": {
    title: "Not enough data yet",
    advice: "Once orders start coming in, this card will pinpoint your growth bottleneck.",
  },
  customers: {
    title: "You need more customers",
    advice: "Volume is the constraint. Push acquisition: Messenger promos, FB posts, QR table tents, and referral offers before touching prices.",
  },
  aov: {
    title: "Customers spend too little",
    advice: "Traffic is fine but tickets are small. Raise AOV with upsells, bundles, and 'make it a meal' upgrades instead of chasing more customers.",
  },
  margin: {
    title: "Sales are strong, margin is thin",
    advice: "Volume and ticket size are healthy but you keep too little. Reprice low-margin items, renegotiate ingredient costs, and push high-margin stars.",
  },
  healthy: {
    title: "All three levers look healthy",
    advice: "Customers, ticket size, and margin all clear their benchmarks. Scale what works: increase ad spend and capacity while watching these numbers.",
  },
};

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

/** Totals plus per-day/week/month averages over the full selected period. */
export function computeGrowthSummary(
  trends: readonly DailyTrend[],
  options: GrowthSummaryOptions,
): GrowthSummary {
  const totalOrders = trends.reduce((sum, day) => sum + day.totalOrders, 0);
  const totalRevenue = trends.reduce((sum, day) => sum + day.totalRevenue, 0);
  const avgRevenuePerDay = safeDivide(totalRevenue, options.periodDays);

  return {
    totalOrders,
    totalRevenue,
    avgOrdersPerDay: safeDivide(totalOrders, options.periodDays),
    avgRevenuePerDay,
    avgRevenuePerWeek: avgRevenuePerDay * DAYS_PER_WEEK,
    avgRevenuePerMonth: avgRevenuePerDay * DAYS_PER_MONTH,
    avgOrderValue: safeDivide(totalRevenue, totalOrders),
    activeDays: trends.filter((day) => day.totalOrders > 0).length,
    revenuePerCustomer:
      options.totalCustomers !== undefined
        ? safeDivide(totalRevenue, options.totalCustomers)
        : undefined,
  };
}

/** Parse a "YYYY-MM-DD" trend date without timezone drift. */
function parseTrendDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** "M/D" of the Monday that starts the week containing the given date. */
function mondayLabel(date: string): string {
  const { year, month, day } = parseTrendDate(date);
  const utc = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay(): Sun=0 … Sat=6 → days since the most recent Monday.
  const sinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - sinceMonday);
  return `${utc.getUTCMonth() + 1}/${utc.getUTCDate()}`;
}

function bucketBy(
  trends: readonly DailyTrend[] | undefined,
  labelFor: (date: string) => string,
): PeriodBucket[] {
  if (!trends) return [];
  const buckets: PeriodBucket[] = [];
  for (const day of trends) {
    const label = labelFor(day.date);
    const existing = buckets.find((b) => b.label === label);
    if (existing) {
      existing.revenue += day.totalRevenue;
      existing.orders += day.totalOrders;
    } else {
      buckets.push({ label, revenue: day.totalRevenue, orders: day.totalOrders });
    }
  }
  return buckets;
}

/** Monday-start weekly revenue/order buckets, in input (chronological) order. */
export function bucketByWeek(trends: readonly DailyTrend[] | undefined): PeriodBucket[] {
  return bucketBy(trends, mondayLabel);
}

/** Calendar-month revenue/order buckets, in input (chronological) order. */
export function bucketByMonth(trends: readonly DailyTrend[] | undefined): PeriodBucket[] {
  return bucketBy(trends, (date) => MONTH_NAMES[parseTrendDate(date).month - 1]);
}

/**
 * Hormozi lens: revenue = customers × frequency × AOV (× margin to keep it).
 * Checked in fix-order — volume first, then ticket size, then margin.
 */
export function diagnoseGrowth(
  input: GrowthDiagnosisInput,
  benchmarks: GrowthBenchmarks = DEFAULT_BENCHMARKS,
): GrowthDiagnosis {
  const bottleneck = resolveBottleneck(input, benchmarks);
  return { bottleneck, ...DIAGNOSIS_COPY[bottleneck] };
}

function resolveBottleneck(
  input: GrowthDiagnosisInput,
  benchmarks: GrowthBenchmarks,
): GrowthBottleneck {
  if (input.totalOrders <= 0) return "no-data";
  if (input.avgOrdersPerDay < benchmarks.minOrdersPerDay) return "customers";
  if (input.avgOrderValue < benchmarks.minAov) return "aov";
  if (input.marginPercent !== undefined && input.marginPercent < benchmarks.minMarginPercent) {
    return "margin";
  }
  return "healthy";
}

/** How many orders (or how big an AOV) it takes to hit a monthly target. */
export function computeScaleTarget(input: ScaleTargetInput): ScaleTarget {
  const ordersNeededPerMonth = Math.ceil(
    safeDivide(input.targetMonthlyRevenue, input.avgOrderValue),
  );
  const ordersNeededPerDay = Math.ceil(ordersNeededPerMonth / DAYS_PER_MONTH);

  return {
    ordersNeededPerMonth,
    ordersNeededPerDay,
    additionalOrdersPerDay: Math.max(
      0,
      Math.ceil(ordersNeededPerDay - input.avgOrdersPerDay),
    ),
    aovNeededAtCurrentVolume: safeDivide(
      input.targetMonthlyRevenue,
      input.avgOrdersPerDay * DAYS_PER_MONTH,
    ),
  };
}
