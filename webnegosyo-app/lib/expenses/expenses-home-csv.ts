/**
 * The Expenses export (design brief §1): the window's book as a spreadsheet,
 * oldest first. Voided rows are kept and marked, so the file matches the
 * paper trail; entries still on this phone are not in the book yet and are
 * left out. Pure string building through `lib/export/csv.ts`.
 */

import { toCsv, type CsvValue } from "../export/csv";
import { PAID_FROM_LABELS } from "./expense-format";
import type { DayRange } from "./expenses-home";
import { isInRange } from "./expenses-home";
import type { Expense, ExpenseCategory } from "./types";

export const EXPENSE_CSV_HEADERS = [
  "Date",
  "Category",
  "Note",
  "Paid to",
  "Paid from",
  "Amount (PHP)",
  "Recorded by",
  "Status",
  "Receipts",
] as const;

const CENTS_PER_PESO = 100;

export function expenseCsvFileName(window: DayRange): string {
  return `expenses_${window.from}_${window.to}.csv`;
}

function csvRow(expense: Expense, category: ExpenseCategory | undefined): CsvValue[] {
  return [
    expense.spentOn,
    category?.name ?? "Other",
    expense.note ?? "",
    expense.paidToName ?? "",
    PAID_FROM_LABELS[expense.paidFrom] ?? expense.paidFrom,
    expense.amountCents / CENTS_PER_PESO,
    expense.createdByName,
    expense.status === "void" ? "Voided" : "Recorded",
    expense.receiptCount,
  ];
}

export function buildExpenseCsv(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  window: DayRange,
): { fileName: string; csv: string; count: number } {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const rows = expenses
    .filter((expense) => isInRange(expense.spentOn, window))
    .sort((a, b) =>
      a.spentOn !== b.spentOn ? (a.spentOn < b.spentOn ? -1 : 1) : Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )
    .map((expense) => csvRow(expense, byId.get(expense.categoryId)));
  return { fileName: expenseCsvFileName(window), csv: toCsv(EXPENSE_CSV_HEADERS, rows), count: rows.length };
}
