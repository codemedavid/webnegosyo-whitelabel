/**
 * Everything the Expenses screen draws, from what it has read (design brief
 * §1). Pure: the screen memoises it and only renders the result.
 */

import { monthBounds, monthOf } from "./expense-format";
import type { QueuedExpense } from "./expense-queue";
import {
  changeText,
  comparisonFor,
  heroEyebrow,
  windowRange,
  type DayRange,
  type HomeView,
} from "./expenses-home";
import { needsYouItems, type NeedsYouItem } from "./expenses-home-needs";
import {
  buildHomeRows,
  categoryBreakdown,
  filterRows,
  groupByDay,
  homeTotals,
  isFiltered,
  spentThrough,
  todaySummary,
  viewCounts,
  type CategoryLine,
  type HomeDay,
  type HomeFilters,
  type HomeRow,
  type HomeTotals,
} from "./expenses-home-rows";
import { computeFlagsForAll } from "./flags";
import { percentChange, type Change } from "./money-text";
import type { Expense, ExpenseCategory } from "./types";

export interface HomeModelInput {
  month: string;
  range: DayRange | null;
  filters: HomeFilters;
  expenses: readonly Expense[];
  /** The month before, for the change pill; null = not known (or a range). */
  previous: readonly Expense[] | null;
  categories: readonly ExpenseCategory[];
  queued: readonly QueuedExpense[];
  waitingReceipts: ReadonlySet<string>;
  unsortedCount: number;
  unsortedCents: number;
  nowMs: number;
}

export interface HomeChange {
  text: string;
  direction: Change["direction"];
}

export interface HomeModel {
  window: DayRange;
  /** The window's rows before any filter. */
  rows: HomeRow[];
  days: HomeDay[];
  totals: HomeTotals;
  /** "Up 9% vs 1–22 Sep"; null when there is nothing to compare with. */
  change: HomeChange | null;
  /** Today's spending; only while the current month is on screen. */
  today: { cents: number; count: number } | null;
  breakdown: CategoryLine[];
  needs: NeedsYouItem[];
  counts: Record<HomeView, number>;
  isFiltered: boolean;
  eyebrow: string;
}

const NO_QUEUE: readonly QueuedExpense[] = [];

function previousSpent(input: HomeModelInput): number | null {
  if (input.range || input.previous === null) return null;
  const comparison = comparisonFor(input.month, input.nowMs);
  const rows = buildHomeRows({
    expenses: input.previous,
    queued: NO_QUEUE,
    categories: input.categories,
    flagsById: computeFlagsForAll(input.previous, { categories: input.categories }),
    waitingReceipts: input.waitingReceipts,
    window: monthBounds(comparison.previousMonth),
  });
  return spentThrough(filterRows(rows, input.filters), comparison.throughDay);
}

function changeOf(change: Change | null, label: string): HomeChange | null {
  const text = changeText(change, label);
  return change === null || text === null ? null : { text, direction: change.direction };
}

export function buildHomeModel(input: HomeModelInput): HomeModel {
  const window = windowRange(input.month, input.range);
  const rows = buildHomeRows({
    expenses: input.expenses,
    queued: input.queued,
    categories: input.categories,
    flagsById: computeFlagsForAll(input.expenses, { categories: input.categories }),
    waitingReceipts: input.waitingReceipts,
    window,
  });
  const visible = filterRows(rows, input.filters);
  const totals = homeTotals(visible);
  const previous = previousSpent(input);
  const filtered = isFiltered(input.filters);
  const isCurrentMonth = input.range === null && input.month === monthOf(input.nowMs);
  return {
    window,
    rows,
    days: groupByDay(visible, input.nowMs),
    totals,
    change: previous === null ? null : changeOf(percentChange(totals.spentCents, previous), comparisonFor(input.month, input.nowMs).label),
    today: isCurrentMonth ? todaySummary(visible, input.nowMs) : null,
    breakdown: categoryBreakdown(filterRows(rows, input.filters, { ignoreCategory: true })),
    needs: needsYouItems({ rows, unsortedCount: input.unsortedCount, unsortedCents: input.unsortedCents }),
    counts: viewCounts(rows),
    isFiltered: filtered,
    eyebrow: heroEyebrow({ month: input.month, range: input.range, isFiltered: filtered }, input.nowMs),
  };
}
