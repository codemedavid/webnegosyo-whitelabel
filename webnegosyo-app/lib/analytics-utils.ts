// Pure data-shaping helpers for the analytics & trends screens.
// Keeps chart/label math out of components so it stays unit-testable.

export interface BreakdownRow {
  label: string;
  value: number;
}

export interface BreakdownRowWithShare extends BreakdownRow {
  share: number;
}

export interface FunnelStageInput {
  label: string;
  value: number;
}

export interface FunnelStep extends FunnelStageInput {
  ratio: number;
}

export interface GrowthBadge {
  direction: "up" | "down" | "flat";
  label: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendDay {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

const FLAT_GROWTH_EPSILON = 0.05;
const MIN_VISIBLE_FUNNEL_RATIO = 0.04;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "12.3%" — one decimal, dropped when whole; non-finite input renders "0%". */
export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Turn a growth percentage into an up/down/flat badge with a signed label. */
export function classifyGrowth(growth: number | undefined): GrowthBadge {
  const safe = typeof growth === "number" && Number.isFinite(growth) ? growth : 0;
  if (Math.abs(safe) < FLAT_GROWTH_EPSILON) {
    return { direction: "flat", label: "0%" };
  }
  const rounded = Math.round(safe * 10) / 10;
  const magnitude = Number.isInteger(rounded)
    ? Math.abs(rounded).toString()
    : Math.abs(rounded).toFixed(1);
  return rounded > 0
    ? { direction: "up", label: `+${magnitude}%` }
    : { direction: "down", label: `-${magnitude}%` };
}

/** Sort descending by value and attach each row's percentage share of the total. */
export function withShares(rows: readonly BreakdownRow[]): BreakdownRowWithShare[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return [...rows]
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      ...row,
      share: total > 0 ? Math.round((row.value / total) * 1000) / 10 : 0,
    }));
}

/**
 * Width ratios for funnel bars, relative to the first stage.
 * Non-zero stages keep a minimum visible ratio so they never vanish.
 */
export function buildFunnelSteps(stages: readonly FunnelStageInput[]): FunnelStep[] {
  const base = stages[0]?.value ?? 0;
  return stages.map((stage) => {
    if (base <= 0) return { ...stage, ratio: 0 };
    const raw = stage.value / base;
    const ratio = stage.value > 0 ? Math.max(raw, MIN_VISIBLE_FUNNEL_RATIO) : 0;
    return { ...stage, ratio: Math.min(ratio, 1) };
  });
}

/** "Fri 7 PM" from a heatmap peak/quiet slot; em dash when absent. */
export function describePeakHour(
  slot: { day: number; hour: number } | null | undefined,
): string {
  if (!slot) return "—";
  const day = DAY_NAMES[slot.day] ?? "—";
  const hour12 = slot.hour % 12 === 0 ? 12 : slot.hour % 12;
  const meridiem = slot.hour < 12 ? "AM" : "PM";
  return `${day} ${hour12} ${meridiem}`;
}

/** Chart-ready points with short M/D labels from getTrends rows. */
export function buildTrendSeries(
  trends: readonly TrendDay[] | undefined,
  metric: "totalOrders" | "totalRevenue" | "avgOrderValue",
): TrendPoint[] {
  if (!trends) return [];
  return trends.map((day) => {
    const [, month, dayOfMonth] = day.date.split("-");
    return {
      label: `${Number(month)}/${Number(dayOfMonth)}`,
      value: day[metric],
    };
  });
}
