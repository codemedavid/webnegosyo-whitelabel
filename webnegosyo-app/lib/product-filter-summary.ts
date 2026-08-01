// What the merchant has narrowed, said back to them.
//
// The Products screen keeps one filter inline (the period) and hides the rest
// behind a sheet. That trade only works if the hidden ones stay visible as
// something — otherwise a figure read three screens down carries no reminder
// that it is Counter-only, Drinks-only, top 25. These chips are that reminder,
// and each one is the handle that removes itself.
//
// Kept pure and beside the other filter maths so the screen stays presentational.

import { SOURCE_OPTIONS } from "./product-analytics-filters";
import type { ProductMetric } from "./product-daily-analytics";

export type ProductFilterKind = "day" | "category" | "source" | "metric" | "topN";

export interface ProductFilterState {
  selectedDay: string | null;
  metric: ProductMetric;
  topN: number | undefined;
  sources: readonly string[];
  categoryId: string | null;
  search: string;
}

/**
 * The view a merchant gets before touching anything: the whole period, every
 * channel and category, ranked by sales, capped at ten so the first screen is
 * readable rather than exhaustive.
 */
export const DEFAULT_PRODUCT_FILTERS: ProductFilterState = {
  selectedDay: null,
  metric: "sales",
  topN: 10,
  sources: [],
  categoryId: null,
  search: "",
};

export interface ProductFilterChip {
  /** Stable list key, and the handle `clearChip` matches on. */
  id: string;
  kind: ProductFilterKind;
  label: string;
  /** Which member of a multi-select dimension this chip stands for. */
  value?: string;
}

export interface FilterChipContext {
  categoryNameById: Readonly<Record<string, string>>;
  /** Renders a "YYYY-MM-DD" key as "Today" / "Yesterday" / "Jul 4". */
  dayLabel: (dateKey: string) => string;
}

const METRIC_CHIP_LABELS: Record<ProductMetric, string> = {
  sales: "By sales",
  units: "By units",
  orders: "By orders",
};

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((option) => [option.value, option.label]),
);

/**
 * Chips in the order the merchant narrowed: when, then what, then how it is
 * ranked. Search is deliberately absent — it has its own visible field with its
 * own clear control, and repeating it here would give one filter two homes.
 */
export function buildFilterChips(
  state: ProductFilterState,
  context: FilterChipContext,
): ProductFilterChip[] {
  const chips: ProductFilterChip[] = [];

  if (state.selectedDay) {
    chips.push({ id: "day", kind: "day", label: context.dayLabel(state.selectedDay) });
  }

  if (state.categoryId) {
    chips.push({
      id: "category",
      kind: "category",
      // A category deleted while its filter was set would otherwise render an
      // empty chip the merchant can neither read nor trust.
      label: context.categoryNameById[state.categoryId] ?? "1 category",
    });
  }

  for (const source of state.sources) {
    chips.push({
      id: `source:${source}`,
      kind: "source",
      label: SOURCE_LABELS[source] ?? source,
      value: source,
    });
  }

  if (state.metric !== DEFAULT_PRODUCT_FILTERS.metric) {
    chips.push({ id: "metric", kind: "metric", label: METRIC_CHIP_LABELS[state.metric] });
  }

  if (state.topN !== DEFAULT_PRODUCT_FILTERS.topN) {
    chips.push({
      id: "topN",
      kind: "topN",
      label: state.topN === undefined ? "All products" : `Top ${state.topN}`,
    });
  }

  return chips;
}

/**
 * How many narrowing choices are hidden in the sheet. Equal to the chip count
 * by construction, so the badge and the chips can never disagree.
 */
export function countActiveFilters(state: ProductFilterState): number {
  let count = state.sources.length;
  if (state.selectedDay) count += 1;
  if (state.categoryId) count += 1;
  if (state.metric !== DEFAULT_PRODUCT_FILTERS.metric) count += 1;
  if (state.topN !== DEFAULT_PRODUCT_FILTERS.topN) count += 1;
  return count;
}

export function hasActiveFilters(state: ProductFilterState): boolean {
  return countActiveFilters(state) > 0;
}

/** Returns the dimension to its default, leaving every other filter alone. */
export function clearChip(
  state: ProductFilterState,
  chip: ProductFilterChip,
): ProductFilterState {
  switch (chip.kind) {
    case "day":
      return { ...state, selectedDay: null };
    case "category":
      return { ...state, categoryId: null };
    case "source":
      return { ...state, sources: state.sources.filter((s) => s !== chip.value) };
    case "metric":
      return { ...state, metric: DEFAULT_PRODUCT_FILTERS.metric };
    case "topN":
      return { ...state, topN: DEFAULT_PRODUCT_FILTERS.topN };
    default:
      return state;
  }
}

/** Clears every narrowing choice but keeps the search term the merchant typed. */
export function clearAllFilters(state: ProductFilterState): ProductFilterState {
  return { ...DEFAULT_PRODUCT_FILTERS, search: state.search };
}
