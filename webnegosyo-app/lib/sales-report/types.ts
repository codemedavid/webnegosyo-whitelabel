/**
 * The answer of the web's `POST /api/reports/query` (src/app/api/reports/
 * query/route.ts; shapes in src/lib/reports/api/run-report-query.ts and
 * src/lib/reports/metrics/registry.ts). The app renders these numbers and
 * never computes one: every figure comes from the web's one sales definition.
 *
 * Mirrored by hand (the app cannot import src/). The web owns the shapes;
 * `client.ts` checks the few fields the screen cannot do without.
 */

export type MetricId =
  | "net_sales"
  | "gross_sales"
  | "discounts"
  | "orders"
  | "aov"
  | "items_sold"
  | "items_per_order"
  | "avg_item_price"
  | "avg_sales_per_day"
  | "avg_orders_per_day"
  | "money_received"
  | "still_to_collect"
  | "service_charge"
  | "delivery_fees"
  | "cancelled_orders"
  | "share_of_sales"
  | "cost_of_food"
  | "gross_profit"
  | "gross_margin_pct"
  | "food_cost_pct"
  | "expenses"
  | "profit"
  | "cost_coverage_pct";

export type MetricFormat = "money" | "count" | "percent" | "decimal";
export type MetricDirection = "up" | "down" | "none";
export type MetricScope = "summary" | "period" | "breakdown";

export interface MetricDef {
  id: MetricId;
  label: string;
  hint: string;
  definition: string;
  format: MetricFormat;
  aggregation: "sum" | "ratio";
  goodDirection: MetricDirection;
  permission: "reports" | "costs";
  scopes: readonly MetricScope[];
}

/** Money in centavos; percentages as fractions. Absent = not computed; null = nothing to divide by. */
export type MetricValues = Partial<Record<MetricId, number | null>>;

export type ReportPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_12_months"
  | "custom";

export type ReportGrain = "hour" | "day" | "week" | "month";
export type CompareTo = "previous" | "last_year" | "none";

export type ReportSection =
  | "summary"
  | "periods"
  | "items"
  | "categories"
  | "payments"
  | "channels"
  | "order_types"
  | "branches"
  | "hours"
  | "profit";

export interface ReportOption {
  value: string;
  label: string;
}

export interface ReportContextPayload {
  period: { preset: ReportPreset; from: string; to: string; label: string; phrase: string; isPartial: boolean; grain: ReportGrain };
  compare: { label: string; phrase: string; kind: string } | null;
  compareTo: "previous" | "last_year";
  branch: string | null;
  branchOptions: ReportOption[] | null;
  lockedBranchLabel: string | null;
  isMultiBranch: boolean;
  presets: ReportOption[];
  today: string;
  periodError: string | null;
  isScheduleFallback: boolean;
}

export interface ReportRow {
  key: string;
  label: string;
  values: MetricValues;
  /** null = the compared period had no such row; absent = not comparing. */
  previous?: MetricValues | null;
  categoryLabel?: string | null;
  isUnrecorded?: boolean;
}

export interface ReportFailure {
  kind: "forbidden" | "invalid" | "failed";
  message: string;
}

export type SectionResult<T> = { ok: true; data: T } | { ok: false; error: ReportFailure };

export interface ReportSections {
  summary?: SectionResult<{ days: number; values: MetricValues; previous: MetricValues | null }>;
  periods?: SectionResult<{ grain: ReportGrain; rows: ReportRow[] }>;
  items?: SectionResult<{ rows: ReportRow[] }>;
  categories?: SectionResult<{ rows: ReportRow[] }>;
  payments?: SectionResult<{ rows: ReportRow[] }>;
  channels?: SectionResult<{ rows: ReportRow[] }>;
  order_types?: SectionResult<{ rows: ReportRow[] }>;
  branches?: SectionResult<{ rows: ReportRow[] }>;
  hours?: SectionResult<{ cells: Array<{ weekday: number; hour: number; values: MetricValues }> }>;
  profit?: SectionResult<{ values: MetricValues; previous: MetricValues | null; ingredientBasis: string; findings: string[] }>;
}

export interface ReportPayload {
  context: ReportContextPayload;
  metrics: MetricDef[];
  sections: ReportSections;
}

export interface ReportQuery {
  tenantId: string;
  period: { preset: ReportPreset; from?: string; to?: string };
  compare: CompareTo;
  branch: string | null;
  sections: ReportSection[];
  grain?: ReportGrain;
}
