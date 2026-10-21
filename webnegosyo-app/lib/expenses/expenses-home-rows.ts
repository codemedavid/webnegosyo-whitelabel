/**
 * The Expenses screen's rows, filters and figures (design brief §1), as data.
 *
 * One row shape covers the book's rows and the entries still on this phone.
 * Every figure on the screen — hero total, group split, day totals, the
 * by-category bars, "Today" — is summed from the SAME filtered rows with the
 * same rule (`countedCents`), so the hero always matches the list under it.
 * A row counts when it is recorded or waiting to send, and is real spending:
 * never a voided row, a refused entry, or cash merely moved.
 */

import { PAID_FROM_LABELS, manilaClock, manilaDate, manilaToday } from "./expense-format";
import type { QueuedExpense } from "./expense-queue";
import { amountOf } from "./expense-queue";
import type { DayRange, HomeView } from "./expenses-home";
import { isInRange } from "./expenses-home";
import type { Expense, ExpenseCategory, ExpenseFlag, ExpenseGroup, PaidFrom } from "./types";

export type RowStatus = "recorded" | "void" | "waiting" | "refused";
/** The small line under a row's amount. */
export type RowNote = "no_receipt" | "waiting" | "refused" | "void";

export const ROW_NOTE_TEXT: Readonly<Record<RowNote, string>> = {
  no_receipt: "No receipt",
  waiting: "Waiting to send",
  refused: "Not sent — tap",
  void: "Voided",
};

export interface HomeRow {
  key: string;
  /** Null for an entry still on this phone. */
  expenseId: string | null;
  queuedId: string | null;
  date: string;
  /** Newest first within a day. */
  sortMs: number;
  categoryId: string;
  category: ExpenseCategory | null;
  group: ExpenseGroup;
  title: string;
  meta: string;
  amountCents: number;
  paidFrom: PaidFrom;
  status: RowStatus;
  isCashMoved: boolean;
  flags: readonly ExpenseFlag[];
  note: RowNote | null;
  refusedReason: string | null;
  hasReceipt: boolean;
  /** Lower-cased note, paid-to and category name. */
  searchText: string;
}

export interface BuildRowsInput {
  expenses: readonly Expense[];
  queued: readonly QueuedExpense[];
  categories: readonly ExpenseCategory[];
  flagsById: Readonly<Record<string, readonly ExpenseFlag[]>>;
  /** Request ids with a receipt still on this phone. */
  waitingReceipts: ReadonlySet<string>;
  /** The days on screen. */
  window: DayRange;
}

const NO_FLAGS: readonly ExpenseFlag[] = [];
const FALLBACK_NAME = "Expense";

function metaOf(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" · ");
}

function searchTextOf(parts: readonly (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function noteFor(status: RowStatus, flags: readonly ExpenseFlag[]): RowNote | null {
  if (status === "void") return "void";
  if (status === "refused") return "refused";
  if (status === "waiting") return "waiting";
  return flags.includes("no_receipt") ? "no_receipt" : null;
}

function rowForExpense(
  expense: Expense,
  category: ExpenseCategory | undefined,
  flags: readonly ExpenseFlag[],
  receiptWaiting: boolean,
): HomeRow {
  const categoryName = category?.name ?? FALLBACK_NAME;
  const note = expense.note?.trim() ?? "";
  const title = note !== "" ? note : categoryName;
  const status: RowStatus = expense.status === "void" ? "void" : "recorded";
  return {
    key: expense.id,
    expenseId: expense.id,
    queuedId: null,
    date: expense.spentOn,
    sortMs: Date.parse(expense.createdAt) || 0,
    categoryId: expense.categoryId,
    category: category ?? null,
    group: category?.group ?? "other",
    title,
    meta: metaOf([
      title === categoryName ? null : categoryName,
      PAID_FROM_LABELS[expense.paidFrom] ?? expense.paidFrom,
      expense.createdByName,
      manilaClock(expense.createdAt),
    ]),
    amountCents: expense.amountCents,
    paidFrom: expense.paidFrom,
    status,
    isCashMoved: category?.group === "not_expense",
    flags,
    note: noteFor(status, flags),
    refusedReason: null,
    hasReceipt: expense.receiptCount > 0 || receiptWaiting,
    searchText: searchTextOf([note, expense.paidToName, categoryName]),
  };
}

function queuedFields(entry: QueuedExpense): {
  date: string;
  categoryId: string;
  paidFrom: PaidFrom;
  note: string;
  paidTo: string | null;
  who: string;
} {
  const payload = entry.payload;
  if (payload.kind === "book") {
    return {
      date: payload.draft.spentOn,
      categoryId: payload.draft.categoryId,
      paidFrom: payload.draft.paidFrom,
      note: payload.draft.note?.trim() ?? "",
      paidTo: payload.draft.paidToName ?? null,
      who: payload.createdByName,
    };
  }
  return {
    date: manilaDate(entry.createdAt),
    categoryId: payload.input.categoryId,
    paidFrom: "drawer",
    note: payload.input.note?.trim() ?? "",
    paidTo: payload.input.paidToName ?? null,
    who: payload.input.recordedByName,
  };
}

function rowForQueued(entry: QueuedExpense, category: ExpenseCategory | undefined, receiptWaiting: boolean): HomeRow {
  const fields = queuedFields(entry);
  const categoryName = category?.name ?? entry.categoryName;
  const title = fields.note !== "" ? fields.note : categoryName;
  const status: RowStatus = entry.refusedReason !== null ? "refused" : "waiting";
  return {
    key: `queued:${entry.id}`,
    expenseId: null,
    queuedId: entry.id,
    date: fields.date,
    sortMs: entry.createdAt,
    categoryId: fields.categoryId,
    category: category ?? null,
    group: category?.group ?? "other",
    title,
    meta: metaOf([
      title === categoryName ? null : categoryName,
      PAID_FROM_LABELS[fields.paidFrom],
      fields.who,
      manilaClock(new Date(entry.createdAt).toISOString()),
    ]),
    amountCents: amountOf(entry.payload),
    paidFrom: fields.paidFrom,
    status,
    isCashMoved: category?.group === "not_expense",
    flags: NO_FLAGS,
    note: noteFor(status, NO_FLAGS),
    refusedReason: entry.refusedReason,
    hasReceipt: receiptWaiting,
    searchText: searchTextOf([fields.note, fields.paidTo, categoryName]),
  };
}

function compareRows(a: HomeRow, b: HomeRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const aQueued = a.queuedId !== null ? 0 : 1;
  const bQueued = b.queuedId !== null ? 0 : 1;
  if (aQueued !== bQueued) return aQueued - bQueued;
  if (a.sortMs !== b.sortMs) return b.sortMs - a.sortMs;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Every row in the window, newest day first; this phone's entries on top of their day. */
export function buildHomeRows(input: BuildRowsInput): HomeRow[] {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const landed = new Set(input.expenses.map((expense) => expense.clientRequestId).filter(Boolean));
  const queuedRows = input.queued
    .filter((entry) => !landed.has(entry.id))
    .map((entry) => rowForQueued(entry, categoryById.get(queuedFields(entry).categoryId), input.waitingReceipts.has(entry.id)))
    .filter((row) => isInRange(row.date, input.window));
  const bookRows = input.expenses
    .filter((expense) => isInRange(expense.spentOn, input.window))
    .map((expense) =>
      rowForExpense(
        expense,
        categoryById.get(expense.categoryId),
        input.flagsById[expense.id] ?? NO_FLAGS,
        expense.clientRequestId ? input.waitingReceipts.has(expense.clientRequestId) : false,
      ),
    );
  return [...queuedRows, ...bookRows].sort(compareRows);
}

/** The money a row adds to every figure on the screen. */
export function countedCents(row: HomeRow): number {
  const isMoney = row.status === "recorded" || row.status === "waiting";
  return isMoney && !row.isCashMoved ? row.amountCents : 0;
}

export interface HomeFilters {
  view: HomeView;
  categoryId: string | null;
  search: string;
}

export const NO_HOME_FILTERS: HomeFilters = { view: "all", categoryId: null, search: "" };

export function isFiltered(filters: HomeFilters): boolean {
  return filters.view !== "all" || filters.categoryId !== null || filters.search.trim() !== "";
}

function hasCheckFlag(flags: readonly ExpenseFlag[]): boolean {
  return flags.some((flag) => flag !== "no_receipt");
}

export function matchesView(row: HomeRow, view: HomeView): boolean {
  switch (view) {
    case "all":
      return true;
    case "drawer":
      return row.paidFrom === "drawer";
    case "no_receipt":
      return row.status === "recorded" && row.flags.includes("no_receipt");
    case "check":
      return row.status === "waiting" || row.status === "refused" || hasCheckFlag(row.flags);
  }
}

/** The rows the filters keep. `ignoreCategory` feeds the by-category view, so another category can be picked. */
export function filterRows(rows: readonly HomeRow[], filters: HomeFilters, options: { ignoreCategory?: boolean } = {}): HomeRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      matchesView(row, filters.view) &&
      (options.ignoreCategory || filters.categoryId === null || row.categoryId === filters.categoryId) &&
      (query === "" || row.searchText.includes(query)),
  );
}

/** How many rows each pill would keep (the window, before any filter). */
export function viewCounts(rows: readonly HomeRow[]): Record<HomeView, number> {
  return {
    all: rows.length,
    drawer: rows.filter((row) => matchesView(row, "drawer")).length,
    no_receipt: rows.filter((row) => matchesView(row, "no_receipt")).length,
    check: rows.filter((row) => matchesView(row, "check")).length,
  };
}

/** Whole percents of `values` that add up to exactly 100 (largest remainder); all zero when nothing. */
export function wholePercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * 100);
  const floors = raw.map(Math.floor);
  const short = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, short)
    .map((entry) => entry.index);
  return floors.map((value, index) => (order.includes(index) ? value + 1 : value));
}

export interface GroupShare {
  group: ExpenseGroup;
  cents: number;
  percent: number;
}

export interface HomeTotals {
  spentCents: number;
  /** Rows that add to the total. */
  count: number;
  /** Cash taken out that is not spending ("Cash moved"). */
  cashMovedCents: number;
  /** Biggest first; percents add up to 100. */
  split: GroupShare[];
}

export function homeTotals(rows: readonly HomeRow[]): HomeTotals {
  const byGroup = new Map<ExpenseGroup, number>();
  let count = 0;
  let cashMovedCents = 0;
  for (const row of rows) {
    const cents = countedCents(row);
    if (row.isCashMoved && row.status === "recorded") cashMovedCents += row.amountCents;
    if (cents === 0) continue;
    count += 1;
    byGroup.set(row.group, (byGroup.get(row.group) ?? 0) + cents);
  }
  const groups = [...byGroup.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const percents = wholePercents(groups.map(([, cents]) => cents));
  return {
    spentCents: groups.reduce((sum, [, cents]) => sum + cents, 0),
    count,
    cashMovedCents,
    split: groups.map(([group, cents], index) => ({ group, cents, percent: percents[index] })),
  };
}

/** Spending up to and including `throughDay` (null = every row): the comparison month's side. */
export function spentThrough(rows: readonly HomeRow[], throughDay: string | null): number {
  return rows
    .filter((row) => throughDay === null || row.date <= throughDay)
    .reduce((sum, row) => sum + countedCents(row), 0);
}

/** "Today ₱X · N expenses". */
export function todaySummary(rows: readonly HomeRow[], nowMs: number): { cents: number; count: number } {
  const today = manilaToday(nowMs);
  const todays = rows.filter((row) => row.date === today && countedCents(row) > 0);
  return { cents: todays.reduce((sum, row) => sum + countedCents(row), 0), count: todays.length };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today · Thu 22 Oct", "Yesterday · Wed 21 Oct", "Mon 19 Oct", "Mon 29 Dec 2025". */
export function dayTitle(date: string, nowMs: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const today = manilaToday(nowMs);
  const yearPart = String(year) === today.slice(0, 4) ? "" : ` ${year}`;
  const plain = `${weekday} ${day} ${SHORT_MONTHS[month - 1]}${yearPart}`;
  if (date === today) return `Today · ${plain}`;
  if (date === manilaDate(nowMs - DAY_MS)) return `Yesterday · ${plain}`;
  return plain;
}

export interface HomeDay {
  date: string;
  title: string;
  totalCents: number;
  rows: HomeRow[];
}

/** Rows (already sorted) gathered by day, newest first, each with its day total. */
export function groupByDay(rows: readonly HomeRow[], nowMs: number): HomeDay[] {
  const days: HomeDay[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last && last.date === row.date) {
      days[days.length - 1] = { ...last, totalCents: last.totalCents + countedCents(row), rows: [...last.rows, row] };
    } else {
      days.push({ date: row.date, title: dayTitle(row.date, nowMs), totalCents: countedCents(row), rows: [row] });
    }
  }
  return days;
}

export interface CategoryLine {
  categoryId: string;
  category: ExpenseCategory | null;
  group: ExpenseGroup;
  cents: number;
  percent: number;
  count: number;
}

/** "By category": every category that holds spending, biggest first; percents add up to 100. */
export function categoryBreakdown(rows: readonly HomeRow[]): CategoryLine[] {
  const lines = new Map<string, Omit<CategoryLine, "percent">>();
  for (const row of rows) {
    const cents = countedCents(row);
    if (cents === 0) continue;
    const previous = lines.get(row.categoryId);
    lines.set(row.categoryId, {
      categoryId: row.categoryId,
      category: row.category,
      group: row.group,
      cents: (previous?.cents ?? 0) + cents,
      count: (previous?.count ?? 0) + 1,
    });
  }
  const sorted = [...lines.values()].sort(
    (a, b) => b.cents - a.cents || (a.category?.name ?? "").localeCompare(b.category?.name ?? ""),
  );
  const percents = wholePercents(sorted.map((line) => line.cents));
  return sorted.map((line, index) => ({ ...line, percent: percents[index] }));
}

/** What a screen reader says for a row. */
export function homeRowLabel(row: HomeRow, spokenAmount: string): string {
  const note = row.note ? `, ${ROW_NOTE_TEXT[row.note].replace(" — tap", "")}` : "";
  return `${row.title}, ${spokenAmount}${note}, ${row.meta}${row.isCashMoved ? ", cash moved, not spending" : ""}`;
}
