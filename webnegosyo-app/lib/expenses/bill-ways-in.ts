/**
 * Ways into Bills to pay from an ordinary expense (recurring-bills.md "Where
 * it shows"): the Undo bar's "Repeat" after saving rent, kuryente or sahod,
 * "Make it a bill?" in Needs you, and the name a new bill starts with. Pure,
 * apart from `knownBills` — the last bills board this phone read, which
 * `BillReminderSync` keeps (a save must not start a database read to decide
 * whether to offer a button).
 */

import { BILL_PRESETS, type Bill } from "./bill-schedule";
import { suggestBills } from "./bill-suggestions";
import { newBillHref } from "./bill-links";
import { shortCategoryName } from "./category-look";
import type { Expense, ExpenseCategory, ExpenseGroup } from "./types";

/**
 * Groups whose expenses come back on a schedule (rent, utilities, staff,
 * permits). Never ingredients (stock receiving counts that cost), never cash
 * merely moved, never a big one-off purchase.
 */
export const REPEAT_GROUPS: readonly ExpenseGroup[] = Object.freeze(["occupancy", "utilities", "staff", "admin"]);

const OTHER_PRESET = "other";

/** "Rent", "Kuryente", "Sahod" for the seeded categories; else the short name ("Permits"). */
export function billNameFor(category: Pick<ExpenseCategory, "name" | "systemKey">): string {
  const preset = BILL_PRESETS.find((candidate) => candidate.key !== OTHER_PRESET && candidate.systemKey === category.systemKey);
  return preset ? preset.name : shortCategoryName(category.name);
}

/** A second button on the Undo bar. */
export interface UndoOffer {
  label: string;
  /** Replaces the bar's message while the offer stands. */
  message: string;
  href: string;
}

export interface RepeatOfferInput {
  /** Drawer pay-outs are never bills in v1. */
  isBook: boolean;
  category: Pick<ExpenseCategory, "id" | "name" | "systemKey" | "group">;
  /** The expense already pays a bill (Mark paid): nothing to offer. */
  billId: string | null | undefined;
  /** Null = the bills are not known on this phone: offer nothing rather than a duplicate. */
  bills: readonly Pick<Bill, "categoryId" | "status">[] | null;
  amountCents: number;
  /** `YYYY-MM-DD`: its day of the month becomes the bill's day. */
  spentOn: string;
  /** "Saved · Rent ₱15,000" (`savedMessage`). */
  savedMessage: string;
}

/** "Saved · Rent ₱15,000 · Pay this every month?" with Repeat, or null. */
export function repeatOffer(input: RepeatOfferInput): UndoOffer | null {
  if (!input.isBook || input.billId || input.bills === null) return null;
  if (!REPEAT_GROUPS.includes(input.category.group)) return null;
  if (input.bills.some((bill) => bill.categoryId === input.category.id && bill.status !== "ended")) return null;
  const day = Number(input.spentOn.slice(8, 10));
  return {
    label: "Repeat",
    message: `${input.savedMessage} · Pay this every month?`,
    href: newBillHref({
      categoryId: input.category.id,
      amountCents: input.amountCents,
      day: Number.isInteger(day) ? day : null,
      name: billNameFor(input.category),
    }),
  };
}

// ── The last board this phone read ───────────────────────────────────────────

let snapshot: { tenantId: string; bills: readonly Pick<Bill, "categoryId" | "status">[] } | null = null;

export function rememberBills(tenantId: string, bills: readonly Pick<Bill, "categoryId" | "status">[]): void {
  snapshot = { tenantId, bills: bills.map(({ categoryId, status }) => ({ categoryId, status })) };
}

export function forgetBills(): void {
  snapshot = null;
}

/** The bills last read for `tenantId`; null when none were (another store, signed out, a cashier). */
export function knownBills(tenantId: string): readonly Pick<Bill, "categoryId" | "status">[] | null {
  return snapshot && snapshot.tenantId === tenantId ? snapshot.bills : null;
}

// ── "Make it a bill?" in Needs you ───────────────────────────────────────────

/** "Not now" keeps a suggestion away this long, per store and category. */
export const SUGGESTION_SNOOZE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const FULL_MONTHS = 3;
const MAX_PER_STEADY_MONTH = 2;

/** One suggestion, worded and ready for Needs you. */
export interface BillSuggestionView {
  categoryId: string;
  /** "Kuryente". */
  name: string;
  typicalDay: number;
  typicalCents: number;
  /** The months it was paid in, oldest first: ["August", "September"]. */
  monthNames: string[];
}

/** category id → when "Not now" was tapped (ms). */
export type SuggestionDismissals = Readonly<Record<string, number>>;

/** Stored dismissals still in force; anything unreadable or older than 30 days is dropped. */
export function activeDismissals(raw: unknown, nowMs: number): SuggestionDismissals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const limit = SUGGESTION_SNOOZE_DAYS * DAY_MS;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] <= nowMs && nowMs - entry[1] < limit,
    ),
  );
}

export function withDismissal(current: SuggestionDismissals, categoryId: string, nowMs: number): SuggestionDismissals {
  return { ...activeDismissals(current, nowMs), [categoryId]: nowMs };
}

/** `YYYY-MM` of the 3 full months before `today`'s, oldest first. */
export function lastFullMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: FULL_MONTHS }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - FULL_MONTHS + index, 1)).toISOString().slice(0, 7),
  );
}

/** The full months a category was paid like a bill (1–2 recorded payments), oldest first. */
export function monthsPaid(
  expenses: readonly Pick<Expense, "categoryId" | "spentOn" | "status">[],
  categoryId: string,
  today: string,
): string[] {
  return lastFullMonths(today).filter((month) => {
    const count = expenses.filter((row) => row.status === "recorded" && row.categoryId === categoryId && row.spentOn.startsWith(month)).length;
    return count > 0 && count <= MAX_PER_STEADY_MONTH;
  });
}

export interface PickSuggestionInput {
  /** The 3 full months before today's (more is fine; the engine picks its window). */
  expenses: readonly Expense[];
  categories: readonly ExpenseCategory[];
  bills: readonly Pick<Bill, "categoryId" | "status">[];
  today: string;
  dismissed: SuggestionDismissals;
  nowMs: number;
  /** "August" for a `YYYY-MM` month. */
  monthName: (month: string) => string;
}

/** The newest suggestion the owner has not put off: at most one at a time. */
export function pickBillSuggestion(input: PickSuggestionInput): BillSuggestionView | null {
  const dismissed = activeDismissals(input.dismissed, input.nowMs);
  const byId = new Map(input.categories.map((category) => [category.id, category]));
  const suggestion = suggestBills(input.expenses, input.categories, input.bills, input.today).find(
    (candidate) => dismissed[candidate.categoryId] === undefined && byId.has(candidate.categoryId),
  );
  if (!suggestion) return null;
  const category = byId.get(suggestion.categoryId) as ExpenseCategory;
  return {
    categoryId: suggestion.categoryId,
    name: billNameFor(category),
    typicalDay: suggestion.typicalDay,
    typicalCents: suggestion.typicalCents,
    monthNames: monthsPaid(input.expenses, suggestion.categoryId, input.today).map(input.monthName),
  };
}
