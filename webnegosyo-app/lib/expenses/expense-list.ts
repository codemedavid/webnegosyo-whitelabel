/**
 * The Expenses screen's list, as data (plan §5.2): rows grouped by day with
 * each day's total, the filters, and the waiting-to-sync rows from this phone.
 *
 * Pure, so the screen only draws it. Day totals come from the shared
 * `summarize` (recorded rows only), so a day header always adds up to the rows
 * under it and the month figure to the days.
 */

import { summarize } from "./totals";
import type { QueuedExpense } from "./expense-queue";
import { amountOf } from "./expense-queue";
import { PAID_FROM_LABELS, dayLabel, manilaClock, manilaDate } from "./expense-format";
import type { Expense, ExpenseCategory, ExpenseFlag, PaidFrom } from "./types";

export interface ExpenseListFilters {
  categoryId: string | null;
  paidFrom: PaidFrom | null;
  needsLook: boolean;
}

export const NO_FILTERS: ExpenseListFilters = { categoryId: null, paidFrom: null, needsLook: false };

export interface ExpenseListRow {
  key: string;
  /** Null for a row still on this phone. */
  expenseId: string | null;
  queuedId: string | null;
  icon: string;
  title: string;
  meta: string;
  amountCents: number;
  isDrawer: boolean;
  isVoid: boolean;
  isNotExpense: boolean;
  hasReceipt: boolean;
  isWaiting: boolean;
  refusedReason: string | null;
  needsLook: boolean;
}

export interface ExpenseDaySection {
  date: string;
  title: string;
  totalCents: number;
  rows: ExpenseListRow[];
}

function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

function iconOf(category: ExpenseCategory | undefined): string {
  return (category?.icon ?? category?.name.slice(0, 2) ?? "··").toUpperCase();
}

export function rowForExpense(
  expense: Expense,
  category: ExpenseCategory | undefined,
  flags: readonly ExpenseFlag[] = [],
): ExpenseListRow {
  const categoryName = category?.name ?? "Expense";
  const note = expense.note?.trim();
  const isVoid = expense.status === "void";
  const source = PAID_FROM_LABELS[expense.paidFrom] ?? expense.paidFrom;
  const meta = isVoid
    ? `Voided${expense.voidReason ? ` · ${expense.voidReason}` : ""}`
    : [source, expense.createdByName, manilaClock(expense.createdAt), expense.isStockPurchase ? "went into stock" : null]
        .filter(Boolean)
        .join(" · ");
  return {
    key: expense.id,
    expenseId: expense.id,
    queuedId: null,
    icon: iconOf(category),
    title: note ? note : categoryName,
    meta,
    amountCents: expense.amountCents,
    isDrawer: expense.paidFrom === "drawer",
    isVoid,
    isNotExpense: category?.group === "not_expense",
    hasReceipt: expense.receiptCount > 0,
    isWaiting: false,
    refusedReason: null,
    needsLook: !isVoid && flags.length > 0,
  };
}

export function rowForQueued(entry: QueuedExpense, category: ExpenseCategory | undefined, receiptWaiting: boolean): ExpenseListRow {
  const payload = entry.payload;
  const note = (payload.kind === "book" ? payload.draft.note : payload.input.note)?.trim();
  const who = payload.kind === "book" ? payload.createdByName : payload.input.recordedByName;
  const source = payload.kind === "book" ? PAID_FROM_LABELS[payload.draft.paidFrom] : PAID_FROM_LABELS.drawer;
  return {
    key: `queued:${entry.id}`,
    expenseId: null,
    queuedId: entry.id,
    icon: iconOf(category),
    title: note ? note : category?.name ?? entry.categoryName,
    meta: entry.refusedReason
      ? `Not saved · ${entry.refusedReason}`
      : `${source} · ${who} · Waiting to sync`,
    amountCents: amountOf(payload),
    isDrawer: payload.kind === "drawer",
    isVoid: false,
    isNotExpense: category?.group === "not_expense",
    hasReceipt: receiptWaiting,
    isWaiting: entry.refusedReason === null,
    refusedReason: entry.refusedReason,
    needsLook: entry.refusedReason !== null,
  };
}

function queuedDate(entry: QueuedExpense): string {
  return entry.payload.kind === "book" ? entry.payload.draft.spentOn : manilaDate(entry.createdAt);
}

function matches(
  filters: ExpenseListFilters,
  input: { categoryId: string; paidFrom: PaidFrom; needsLook: boolean },
): boolean {
  if (filters.categoryId && input.categoryId !== filters.categoryId) return false;
  if (filters.paidFrom && input.paidFrom !== filters.paidFrom) return false;
  if (filters.needsLook && !input.needsLook) return false;
  return true;
}

export interface BuildListInput {
  expenses: readonly Expense[];
  queued: readonly QueuedExpense[];
  categories: readonly ExpenseCategory[];
  flagsById: Readonly<Record<string, readonly ExpenseFlag[]>>;
  /** Request ids with a receipt still on this phone. */
  waitingReceipts: ReadonlySet<string>;
  filters: ExpenseListFilters;
  /** `YYYY-MM`: queued rows outside the month are left for their own month. */
  month: string;
  now?: number;
}

/** Day sections, newest day first; rows newest first; waiting rows on top of their day. */
export function buildExpenseSections(input: BuildListInput): ExpenseDaySection[] {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const landed = new Set(input.expenses.map((expense) => expense.clientRequestId).filter(Boolean));
  const byDay = new Map<string, { expenses: Expense[]; rows: ExpenseListRow[] }>();
  const bucket = (date: string) => {
    const existing = byDay.get(date);
    if (existing) return existing;
    const created = { expenses: [] as Expense[], rows: [] as ExpenseListRow[] };
    byDay.set(date, created);
    return created;
  };

  for (const entry of input.queued) {
    const date = queuedDate(entry);
    if (landed.has(entry.id) || !date.startsWith(input.month)) continue;
    const payload = entry.payload;
    const categoryId = payload.kind === "book" ? payload.draft.categoryId : payload.input.categoryId;
    const paidFrom: PaidFrom = payload.kind === "book" ? payload.draft.paidFrom : "drawer";
    const row = rowForQueued(entry, categoryById.get(categoryId), input.waitingReceipts.has(entry.id));
    if (!matches(input.filters, { categoryId, paidFrom, needsLook: row.needsLook })) continue;
    bucket(date).rows.push(row);
  }

  const sorted = [...input.expenses].sort((a, b) =>
    a.spentOn === b.spentOn ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.spentOn < b.spentOn ? 1 : -1,
  );
  for (const expense of sorted) {
    const flags = input.flagsById[expense.id] ?? [];
    const row = rowForExpense(expense, categoryById.get(expense.categoryId), flags);
    if (!matches(input.filters, { categoryId: expense.categoryId, paidFrom: expense.paidFrom, needsLook: row.needsLook })) {
      continue;
    }
    const day = bucket(expense.spentOn);
    day.expenses.push(expense);
    day.rows.push({ ...row, hasReceipt: row.hasReceipt || (expense.clientRequestId ? input.waitingReceipts.has(expense.clientRequestId) : false) });
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, day]) => {
      const summary = summarize(day.expenses, input.categories);
      const waitingCents = day.rows
        .filter((row) => row.queuedId !== null && row.isWaiting && !row.isNotExpense)
        .reduce((sum, row) => sum + row.amountCents, 0);
      return {
        date,
        title: dayLabel(date, input.now),
        totalCents: summary.totalCents - summary.notExpenseCents + waitingCents,
        rows: day.rows,
      };
    });
}

/** "Gastos this month": every recorded peso spent, without cash merely taken out. */
export function monthSpentCents(expenses: readonly Expense[], categories: readonly ExpenseCategory[]): {
  spentCents: number;
  takenOutCents: number;
  count: number;
} {
  const summary = summarize(expenses, categories);
  return {
    spentCents: summary.totalCents - summary.notExpenseCents,
    takenOutCents: summary.notExpenseCents,
    count: summary.count,
  };
}

/** The category filter's choices: only categories that appear this month, biggest first. */
export function categoryFilterChoices(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
): { id: string; label: string }[] {
  const summary = summarize(expenses, categories);
  const byId = new Map(categories.map((category) => [category.id, category]));
  return summary.byCategory.map((line) => ({
    id: line.categoryId,
    label: shortName(byId.get(line.categoryId)?.name ?? "Other"),
  }));
}

/** Spoken row for a screen reader: "Gas / LPG, 1,250 pesos, from the drawer, 9:42 AM". */
export function rowAccessibilityLabel(row: ExpenseListRow, spokenAmount: string): string {
  const state = row.isVoid ? "voided, " : row.isWaiting ? "waiting to sync, " : row.refusedReason ? "not saved, " : "";
  return `${row.title}, ${state}${spokenAmount}, ${row.meta}${row.hasReceipt ? ", has a receipt" : ""}`;
}
