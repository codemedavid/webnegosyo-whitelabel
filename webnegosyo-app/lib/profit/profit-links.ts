/**
 * Where Profit's taps go. A drill-down into Expenses carries the EXACT days
 * the profit figure covers (`?from=&to=`, the Expenses contract in
 * docs/plans/expenses/app-design.md), never just the month. Pure.
 */

import { manilaDay, type ProfitWindow } from "./profit-period";
import type { FindingAction } from "./profit-view";

export const EXPENSES_ROUTE = "/(main)/expenses";
const RECIPES_ROUTE = "/(main)/product-management";

export interface DayRange {
  fromKey: string;
  toKey: string;
}

/**
 * The Manila days the figure was read over: a running period ends today, a
 * finished one on its last day.
 */
export function readRange(w: Pick<ProfitWindow, "fromKey" | "toKey" | "start" | "end" | "isPartial">): DayRange {
  if (!w.isPartial) return { fromKey: w.fromKey, toKey: w.toKey };
  const lastRead = lastReadDay(w);
  return { fromKey: w.fromKey, toKey: lastRead < w.fromKey ? w.fromKey : lastRead > w.toKey ? w.toKey : lastRead };
}

/** Expenses over the same days, optionally on one category. */
export function expensesHref(range: DayRange, categoryId?: string): string {
  const category = categoryId ? `category=${encodeURIComponent(categoryId)}&` : "";
  return `${EXPENSES_ROUTE}?${category}from=${range.fromKey}&to=${range.toKey}`;
}

export function findingHref(action: FindingAction): string {
  switch (action.kind) {
    case "record":
      return `${EXPENSES_ROUTE}?add=1&category=${encodeURIComponent(action.categoryId)}`;
    case "add":
      return `${EXPENSES_ROUTE}?add=1`;
    case "sort":
      return `${EXPENSES_ROUTE}?view=unsorted`;
    case "recipes":
      return RECIPES_ROUTE;
  }
}

/** For the range picker: the last day a window covers so far. */
export function lastReadDay(w: Pick<ProfitWindow, "start" | "end">): string {
  return manilaDay(Math.max(w.start, w.end - 1));
}
